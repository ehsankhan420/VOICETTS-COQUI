import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import multer from "multer"
import { fileURLToPath } from "url"
import path from "path"
import fs from "fs"
import { v4 as uuidv4 } from "uuid"
import fetch from "node-fetch"

// Configuration
dotenv.config()
const app = express()
const PORT = process.env.PORT || 5000
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// In-memory storage for conversations
const conversations = new Map()

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const uniqueFilename = `${uuidv4()}-${file.originalname}`
    cb(null, uniqueFilename)
  },
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
})

// Routes
app.get("/", (req, res) => {
  res.send("FINOVA Voice AI API is running")
})

// Process voice with Gemini API
app.post("/api/process-voice", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" })
    }

    const filePath = req.file.path
    const prompt = req.body.prompt || "Please transcribe this audio and respond appropriately."

    // Read the file as base64
    const fileBuffer = fs.readFileSync(filePath)
    const base64Audio = fileBuffer.toString("base64")

    // Prepare the request body for Gemini API
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
            {
              inline_data: {
                mime_type: req.file.mimetype,
                data: base64Audio,
              },
            },
          ],
        },
      ],
      generation_config: {
        temperature: 0.4,
        top_p: 0.95,
        top_k: 40,
      },
    }

    // Make request to Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    )

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json()
      console.error("Gemini API error:", errorData)
      return res.status(500).json({ error: "Failed to process with Gemini API" })
    }

    const geminiData = await geminiResponse.json()

    // Extract text from Gemini response
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated"

    // Generate a unique request ID
    const requestId = uuidv4()

    // Store in memory
    conversations.set(requestId, {
      prompt,
      response: text,
      timestamp: new Date().toISOString(),
    })

    return res.json({ text, requestId })
  } catch (error) {
    console.error("Error processing voice:", error)
    return res.status(500).json({ error: "Failed to process voice" })
  }
})

// Conversation API endpoint
app.post("/api/conversation", async (req, res) => {
  try {
    const { text, conversationId, conversationHistory = [] } = req.body

    if (!text) {
      return res.status(400).json({ error: "No text provided" })
    }

    console.log("Received conversation request:", { text, conversationId })
    console.log("Conversation history length:", conversationHistory.length)

    // Format conversation history for Gemini API
    const formattedHistory = conversationHistory.map((message) => ({
      role: message.role === "user" ? "user" : "model",
      parts: [{ text: message.content }],
    }))

    // Prepare the request body for Gemini API
    const requestBody = {
      contents: [
        ...formattedHistory,
        {
          role: "user",
          parts: [{ text }],
        },
      ],
      generation_config: {
        temperature: 0.7,
        top_p: 0.95,
        top_k: 40,
        max_output_tokens: 1024,
      },
    }

    console.log("Sending request to Gemini API...")

    // Make request to Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    )

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json()
      console.error("Gemini API error:", errorData)
      return res.status(500).json({ error: "Failed to process with Gemini API" })
    }

    const geminiData = await geminiResponse.json()

    // Extract text from Gemini response
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated"
    console.log("Received response from Gemini:", responseText.substring(0, 100) + "...")

    // Create a new conversation entry or update existing one
    const requestId = conversationId || uuidv4()

    // Store in memory
    conversations.set(requestId, {
      prompt: text,
      response: responseText,
      timestamp: new Date().toISOString(),
    })

    return res.json({
      text: responseText,
      conversationId: requestId,
    })
  } catch (error) {
    console.error("Error in conversation endpoint:", error)
    return res.status(500).json({ error: "Failed to process conversation" })
  }
})

// Synthesize speech with ElevenLabs API
app.post("/api/synthesize-speech", async (req, res) => {
  try {
    const { text, requestId } = req.body

    if (!text) {
      return res.status(400).json({ error: "No text provided" })
    }

    console.log("Synthesizing speech for text:", text.substring(0, 100) + "...")

    // Check if ElevenLabs API key is configured
    if (!process.env.ELEVENLABS_API_KEY) {
      console.error("ELEVENLABS_API_KEY not configured")
      return res.status(500).json({
        error: "ElevenLabs API key not configured",
        useClientSynthesis: true,
        text: text,
      })
    }

    // Default voice ID for ElevenLabs
    const voiceId = "EXAVITQu4vr4xnSDxMaL"

    // Make request to ElevenLabs API
    const elevenLabsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    })

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text()
      console.error("ElevenLabs API error:", errorText)
      return res.status(500).json({
        error: "Failed to synthesize speech with ElevenLabs API",
        details: errorText,
      })
    }

    // Get the audio data
    const audioBuffer = await elevenLabsResponse.arrayBuffer()
    console.log("Received audio data, size:", audioBuffer.byteLength)

    // Save the audio file
    const audioFilename = `${uuidv4()}.mp3`
    const audioPath = path.join(uploadsDir, audioFilename)
    fs.writeFileSync(audioPath, Buffer.from(audioBuffer))
    console.log("Saved audio file to:", audioPath)

    // Return the audio file path
    const audioUrl = `/uploads/${audioFilename}`
    return res.json({ audioUrl })
  } catch (error) {
    console.error("Error synthesizing speech:", error)
    return res.status(500).json({
      error: "Failed to synthesize speech",
      details: error.message,
    })
  }
})

// Serve static files from the uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")))

// Get history of voice requests (in-memory version)
app.get("/api/history", async (req, res) => {
  try {
    const historyArray = Array.from(conversations.entries())
      .map(([id, data]) => ({
        _id: id,
        ...data,
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20)

    return res.json(historyArray)
  } catch (error) {
    console.error("Error fetching history:", error)
    return res.status(500).json({ error: "Failed to fetch history" })
  }
})

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

