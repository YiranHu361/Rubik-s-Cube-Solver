//Vercel serverless function: reads the stickers of a Rubik's cube from two
//corner photos with Claude.
//
//  POST /api/read-cube
//  {"photos": [{"data": "<base64>", "mediaType": "image/jpeg"}, {...}]}
//  -> {"photos": [{"faces": [...], "corners": {...}}, {...}], "model": "...", "usage": {...}}
//
//The page (Rubik's Cube Solver_C++/3x3-two-phase/web/app.js) sends the two
//photos downscaled to about 800 px. The reply follows the JSON schema below,
//which the client turns into stickers with aiRead.js. Needs the
//ANTHROPIC_API_KEY environment variable on the Vercel project; CUBE_READ_MODEL
//optionally overrides the model.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CUBE_READ_MODEL || "claude-opus-5-5";
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;//per photo, base64 length
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];
const COLOUR_NAMES = ["white", "yellow", "red", "orange", "green", "blue"];

const point = {type: "array", items: {type: "number"}};
const PHOTO_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["faces", "corners"],
    properties: {
        faces: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["position", "grid"],
                properties: {
                    position: {type: "string", enum: ["top", "lower_right", "lower_left", "bottom", "upper_left", "upper_right"]},
                    grid: {type: "array", items: {type: "array", items: {type: "string", enum: COLOUR_NAMES}}}
                }
            }
        },
        corners: {
            type: "object",
            additionalProperties: false,
            required: ["near", "outer"],
            properties: {near: point, outer: {type: "array", items: point}}
        }
    }
};
export const READING_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["photos"],
    properties: {photos: {type: "array", items: PHOTO_SCHEMA}}
};

export const INSTRUCTIONS = `Each photo shows a Rubik's cube from a corner, so exactly three faces are visible and they meet at one vertex, the "near corner". Read every sticker.

For each photo:
1. Order the three faces clockwise on the picture, starting from the topmost face. Give each a position label (top, lower_right, lower_left, or the nearest of the other labels if the cube is held differently).
2. Describe each face as a 3x3 grid. grid[0][0] is the sticker that touches the near corner. The first index grows along the edge this face shares with the NEXT face in clockwise order; the second index grows along the edge it shares with the PREVIOUS face. So grid[1][1] is the centre and grid[2][2] is the face's far corner. Follow the sticker rows along those edges even when the face is seen at a slant.
3. Use the six names white, yellow, red, orange, green, blue. Pick the closest name for shaded or glossy stickers; red is darker than orange, white is paler than yellow. Every face has exactly nine stickers.
4. corners: approximate positions as fractions of the image width and height (0 to 1). near is the near corner; outer is the six corners of the cube's outline in clockwise order, starting anywhere.

The two photos are of the same cube from opposite corners, so across both photos each colour appears nine times and the six centre stickers are six different colours. Check your counts before answering.`;

//Validates a reading's shape; returns "" or a reason.
export function validateReading(reading){
    if(!reading || !Array.isArray(reading.photos) || reading.photos.length !== 2) return "expected two photos";
    for(const photo of reading.photos){
        if(!photo || !Array.isArray(photo.faces) || photo.faces.length !== 3) return "expected three faces per photo";
        for(const face of photo.faces){
            if(!Array.isArray(face.grid) || face.grid.length !== 3 || face.grid.some(r => !Array.isArray(r) || r.length !== 3)) return "each face needs a 3x3 grid";
            for(const row of face.grid) for(const name of row) if(!COLOUR_NAMES.includes(name)) return `unknown colour ${name}`;
        }
        const c = photo.corners;
        const ok = p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === "number" && v >= 0 && v <= 1);
        if(c && !(ok(c.near) && Array.isArray(c.outer) && c.outer.length === 6 && c.outer.every(ok))) photo.corners = null;
    }
    return "";
}

//Asks the model. "client" is injectable for tests.
export async function readCube(photos, client = new Anthropic()){
    const content = [];
    photos.forEach((photo, i) => {
        content.push({type: "text", text: `Photo ${i + 1}:`});
        content.push({type: "image", source: {type: "base64", media_type: photo.mediaType, data: photo.data}});
    });
    content.push({type: "text", text: INSTRUCTIONS});
    //Thinking tokens count against max_tokens, so leave plenty of room; low
    //effort keeps a perception task well inside the function's time limit.
    const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {effort: "low", format: {type: "json_schema", schema: READING_SCHEMA}},
        messages: [{role: "user", content}]
    });
    if(response.stop_reason === "refusal"){
        const why = response.stop_details && response.stop_details.explanation;
        throw new Error("The model declined to read these photos" + (why ? ": " + why : "."));
    }
    if(response.stop_reason === "max_tokens") throw new Error("The model's answer was cut off (max_tokens).");
    const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
    let reading;
    try{
        reading = JSON.parse(text);
    }catch(err){
        //Be forgiving about anything around the JSON object.
        const start = text.indexOf("{"), end = text.lastIndexOf("}");
        try{ reading = JSON.parse(text.slice(start, end + 1)); }
        catch(err2){ throw new Error(`The model's answer was not valid JSON (stop_reason ${response.stop_reason}, ${text.length} chars: ${text.slice(0, 160)})`); }
    }
    const problem = validateReading(reading);
    if(problem) throw new Error("The model's answer was incomplete: " + problem);
    return {photos: reading.photos, model: response.model, usage: response.usage};
}

export default async function handler(req, res){
    if(req.method !== "POST"){
        res.status(405).json({error: "POST a JSON body with two photos."});
        return;
    }
    if(!process.env.ANTHROPIC_API_KEY){
        res.status(503).json({error: "The server has no ANTHROPIC_API_KEY. Add it to the Vercel project's environment variables."});
        return;
    }
    const body = req.body || {};
    const photos = Array.isArray(body.photos) ? body.photos : [];
    if(photos.length !== 2){
        res.status(400).json({error: "Send exactly two photos."});
        return;
    }
    for(const photo of photos){
        if(!photo || typeof photo.data !== "string" || !MEDIA_TYPES.includes(photo.mediaType)){
            res.status(400).json({error: "Each photo needs base64 data and a JPEG, PNG or WebP media type."});
            return;
        }
        if(photo.data.length > MAX_IMAGE_BYTES){
            res.status(413).json({error: "A photo is too large; the page should send them downscaled."});
            return;
        }
    }
    try{
        const result = await readCube(photos);
        res.status(200).json(result);
    }catch(err){
        const status = err && err.status ? err.status : 502;
        res.status(status >= 400 && status < 600 ? status : 502).json({error: String(err && err.message || err)});
    }
}
