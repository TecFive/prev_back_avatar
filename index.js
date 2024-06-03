import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-",
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "gD1IexrzCvsXPHUuT0s3";

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  await execCommand(
    `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
  );
  await execCommand(
    `./bin/rhubarb -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`
  );
};

app.post("/chat", async (req, res) => {
  let userMessage = req.body.message;

  if (userMessage === "iniciar reservacion") {
    userMessage = "Di tu nombre y preguntame '¿Que día quieres reservar un laboratorio?";
  }

  const dateRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[012])\/(19|20)\d\d$/;

  if (dateRegex.test(userMessage)) {
    userMessage = "Pregunta solamente '¿Qué laboratorio quieres reservar?'";
  }

  if (userMessage === "Laboratorio Lego Room" || userMessage === "Laboratorio VR Room" || userMessage === "Laboratorio PC Room" || userMessage === "Laboratorio Meeting Room" || userMessage === "Laboratorio Electric Garage" || userMessage === "Laboratorio PCB Factory") {
    userMessage = "Pregunta solamente '¿A qué hora quieres que inicie tu reservación y por cuánto tiempo?'";
  }

  const timeRangeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]\s*-\s*([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

  if (timeRangeRegex.test(userMessage)) {
    userMessage = "Pregunta solamente '¿Qué equipos te gustaría reservar?'";
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-1106",
    max_tokens: 1000,
    temperature: 0.6,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: `
        Eres una asistente llamada Aylin que hace reservaciones en laboratorios de una universidad llamada Tec de Monterrey.
        Siempre responderás con un array JSON de mensajes.
        Cada mensaje tiene una propiedad de texto, expresión facial y animación.
        Las diferentes expresiones faciales son: smile.
        Las diferentes animaciones son: Talking_0. 
        `,
      },
      {
        role: "user",
        content: userMessage || "Hello",
      },
    ],
  });
  let messages = JSON.parse(completion.choices[0].message.content);
  if (messages.messages) {
    messages = messages.messages;
  }
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const fileName = `audios/message_${i}.mp3`;
    const textInput = message.text;
    await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
    await lipSyncMessage(i);
    message.audio = await audioFileToBase64(fileName);
    message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
  }

  res.send({ messages });
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`TecFive listening on port ${port}`);
});
