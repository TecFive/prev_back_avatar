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
const voiceID = "gxSxrhNNXvdHpOH0EHjV";

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

function numeroAPalabras(numero) {
  const unidades = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
  const decenas = ["", "", "veinte", "treinta"];
  
  if (numero < 20) {
    return unidades[numero];
  } else if (numero < 100) {
    let unidad = numero % 10;
    let decena = Math.floor(numero / 10);
    return decenas[decena] + (unidad > 0 ? " y " + unidades[unidad] : "");
  } else {
    return numero.toString();
  }
}

app.post("/chat", async (req, res) => {
  let userMessage = req.body.message;
  let previousMessage = userMessage;

  console.log(`User message: ${userMessage}`);

  const timeRangeRegex = /^([01]?[0-9]|2[0-3]):(00|30)\s*-\s*([01]?[0-9]|2[0-3]):(00|30)$/;

  const numbersToWords = {
    '00': '',
    '01': 'una',
    '02': 'dos',
    '03': 'tres',
    '04': 'cuatro',
    '05': 'cinco',
    '06': 'seis',
    '07': 'siete',
    '08': 'ocho',
    '09': 'nueve',
    '10': 'diez',
    '11': 'once',
    '12': 'doce',
    '13': 'una',
    '14': 'dos',
    '15': 'tres',
    '16': 'cuatro',
    '17': 'cinco',
    '18': 'seis',
    '19': 'siete',
    '20': 'ocho',
    '21': 'nueve',
    '22': 'diez',
    '23': 'once',
    '30': 'y media'
  };

  if (timeRangeRegex.test(userMessage)) {
    let [start, end] = userMessage.split('-').map(time => time.trim());
    let [startHour, startMinute] = start.split(':');
    let [endHour, endMinute] = end.split(':');

    let startPeriod = startHour >= 12 ? 'de la tarde' : 'de la mañana';
    let endPeriod = endHour >= 12 ? 'de la tarde' : 'de la mañana';

    startHour = startHour % 12 || 12;
    endHour = endHour % 12 || 12;

    let startHourInWords = numbersToWords[String(startHour).padStart(2, '0')] || '';
    let startMinuteInWords = numbersToWords[startMinute] || '';
    let endHourInWords = numbersToWords[String(endHour).padStart(2, '0')] || '';
    let endMinuteInWords = numbersToWords[endMinute] || '';

    userMessage = `Di unicamente lo siguiente "Será en el horario de las ${startHourInWords} ${startMinuteInWords} ${startPeriod} hasta las ${endHourInWords} ${endMinuteInWords} ${endPeriod} ¿Qué equipos te gustaría reservar?"`;
  }

  const dateRegex = /^([0-2]?[0-9]|3[01])\/([0-1]?[0-9])\/(19|20)\d\d$/;

  if (dateRegex.test(userMessage)) {
    const dateParts = userMessage.split("/");
    const dateObject = new Date(+dateParts[2], dateParts[1] - 1, +dateParts[0]);

    const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const fechaFormateada = `${dias[dateObject.getDay()]}, ${numeroAPalabras(dateObject.getDate())} de ${meses[dateObject.getMonth()]}`;

    userMessage = `Di unicamente lo siguiente "Será el ${fechaFormateada}, ¿Qué laboratorio te gustaría reservar?"`;
  }

  const equipmentRegex = /(\d+)\s(\w+)(\s-\s)?/g;
  let match;
  let equipos = [];

  while ((match = equipmentRegex.exec(userMessage)) !== null) {
    const numero = numeroAPalabras(+match[1]);
    const equipo = traducirEquipo(match[2]);
    equipos.push(`${numero} ${equipo}`);
  }

  if (equipos.length > 0) {
    const equiposFormateados = equipos.join(" y ");
    userMessage = `Di unicamente lo siguiente "Los equipos seleccionados fueron ${equiposFormateados}, Para completar tu reservación apoyame dando clck en el boton Reservar"`;
  }

  function traducirEquipo(equipo) {
    switch (equipo.toLowerCase()) {
      case 'projector':
        return 'proyectores';
      case 'whiteboard':
        return 'pizarrones';
      case 'lego':
        return 'legos';
      case 'vr':
        return 'lentes';
      case 'pc':
        return 'computadoras';
      default:
        return equipo;
    }
  }

  if (userMessage === "iniciar reservacion") {
    userMessage = "Di unicamente lo siguiente 'Bienvenido Jose Oliva ¿Que día te gustaria reservar un laboratorio?";
  }

  if (userMessage === "reservacion creada") {
    userMessage = "Di unicamente lo siguiente 'Tu reservacion fue creada con exito, te esperamos el dia de la reservacion'";
  }

  if (userMessage === "Laboratorio Lego Room" || userMessage === "Laboratorio VR Room" || userMessage === "Laboratorio PC Room" || userMessage === "Laboratorio Meeting Room" || userMessage === "Laboratorio Electric Garage" || userMessage === "Laboratorio PCB Factory" || userMessage === "Laboratorio New Horizons" || userMessage === "Laboratorio Graveyard" || userMessage === "Laboratorio Dimension Forge") {
    userMessage = `Di unicamente lo siguiente "Será en el ${previousMessage} ¿En que horario te gustaria reservar?"`;
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
