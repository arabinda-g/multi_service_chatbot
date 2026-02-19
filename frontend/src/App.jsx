import { useEffect, useRef, useState } from 'react'
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } from '@aws-sdk/client-transcribe'
import './App.css'

const ALL_STT_OPTIONS = [
  'Azure Speech-to-Text',
  'Google Cloud STT',
  'Deepgram',
  'AWS Transcribe',
  'OpenAI Whisper API',
  'ElevenLabs STT',
  'Wispr Flow',
  'Murf Falcon',
]

const ALL_AI_OPTIONS = ['OpenAI API', 'Gemini']

const ALL_TTS_OPTIONS = [
  'Azure Text-to-Speech',
  'Google Cloud TTS',
  'OpenAI TTS',
  'ElevenLabs TTS',
  'Amazon Polly',
  'Murf TTS',
]

const STORAGE_KEY = 'multiServiceChatbotPreferences'
const DEFAULT_USER_NAME = 'Guest'

const ENV = import.meta.env
const OPENAI_API_KEY = ENV.VITE_OPENAI_API_KEY
const GEMINI_API_KEY = ENV.VITE_GEMINI_API_KEY
const ELEVENLABS_API_KEY = ENV.VITE_ELEVENLABS_API_KEY
const ELEVENLABS_TTS_MODEL = ENV.VITE_ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5'
const ELEVENLABS_VOICE_ID = ENV.VITE_ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'
const MURF_API_BASE_URL = ENV.VITE_MURF_API_BASE_URL || 'https://api.murf.ai'
const MURF_FALCON_VOICE_ID = ENV.VITE_MURF_FALCON_VOICE_ID || 'en-US-natalie'
const MURF_TTS_VOICE_ID = ENV.VITE_MURF_TTS_VOICE_ID || 'en-US-natalie'
const AWS_POLLY_VOICE_ID = ENV.VITE_AWS_POLLY_VOICE_ID || 'Joanna'
const AWS_TRANSCRIBE_BUCKET = ENV.VITE_AWS_TRANSCRIBE_BUCKET || ''
const AWS_TRANSCRIBE_PREFIX = ENV.VITE_AWS_TRANSCRIBE_PREFIX || 'voice-inputs'

const SERVICE_ENABLE_ENV_KEY = {
  'Azure Speech-to-Text': 'VITE_ENABLE_AZURE_STT',
  'Google Cloud STT': 'VITE_ENABLE_GOOGLE_CLOUD_STT',
  Deepgram: 'VITE_ENABLE_DEEPGRAM',
  'AWS Transcribe': 'VITE_ENABLE_AWS_TRANSCRIBE',
  'OpenAI Whisper API': 'VITE_ENABLE_OPENAI_WHISPER',
  'ElevenLabs STT': 'VITE_ENABLE_ELEVENLABS_STT',
  'Wispr Flow': 'VITE_ENABLE_WISPR_FLOW',
  'Murf Falcon': 'VITE_ENABLE_MURF_FALCON',
  Gemini: 'VITE_ENABLE_GEMINI',
  'OpenAI API': 'VITE_ENABLE_OPENAI_API',
  'Azure Text-to-Speech': 'VITE_ENABLE_AZURE_TTS',
  'Google Cloud TTS': 'VITE_ENABLE_GOOGLE_CLOUD_TTS',
  'OpenAI TTS': 'VITE_ENABLE_OPENAI_TTS',
  'ElevenLabs TTS': 'VITE_ENABLE_ELEVENLABS_TTS',
  'Amazon Polly': 'VITE_ENABLE_AMAZON_POLLY',
  'Murf TTS': 'VITE_ENABLE_MURF_TTS',
}

function isServiceEnabled(provider) {
  const envKey = SERVICE_ENABLE_ENV_KEY[provider]
  if (!envKey) {
    return true
  }
  const raw = ENV[envKey]
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return true
  }
  const normalized = String(raw).trim().toLowerCase()
  return !['false', '0', 'no', 'off'].includes(normalized)
}

const STT_OPTIONS = ALL_STT_OPTIONS.filter(isServiceEnabled)
const AI_OPTIONS = ALL_AI_OPTIONS.filter(isServiceEnabled)
const TTS_OPTIONS = ALL_TTS_OPTIONS.filter(isServiceEnabled)

const PROVIDER_ENV_KEYS = {
  'Azure Speech-to-Text': ['VITE_AZURE_STT_KEY', 'VITE_AZURE_STT_REGION'],
  'Google Cloud STT': ['VITE_GOOGLE_CLOUD_STT_API_KEY'],
  Deepgram: ['VITE_DEEPGRAM_API_KEY'],
  'AWS Transcribe': [
    'VITE_AWS_POLLY_ACCESS_KEY_ID',
    'VITE_AWS_POLLY_SECRET_ACCESS_KEY',
    'VITE_AWS_REGION',
    'VITE_AWS_TRANSCRIBE_BUCKET',
  ],
  'OpenAI Whisper API': ['VITE_OPENAI_API_KEY'],
  'ElevenLabs STT': ['VITE_ELEVENLABS_API_KEY'],
  'Wispr Flow': ['VITE_WISPR_FLOW_API_KEY'],
  'Murf Falcon': ['VITE_MURF_FALCON_API_KEY'],
  Gemini: ['VITE_GEMINI_API_KEY'],
  'OpenAI API': ['VITE_OPENAI_API_KEY'],
  'Azure Text-to-Speech': ['VITE_AZURE_TTS_KEY', 'VITE_AZURE_TTS_REGION'],
  'Google Cloud TTS': ['VITE_GOOGLE_CLOUD_TTS_API_KEY'],
  'OpenAI TTS': ['VITE_OPENAI_API_KEY'],
  'ElevenLabs TTS': ['VITE_ELEVENLABS_API_KEY'],
  'Amazon Polly': ['VITE_AWS_POLLY_ACCESS_KEY_ID', 'VITE_AWS_POLLY_SECRET_ACCESS_KEY', 'VITE_AWS_REGION'],
  'Murf TTS': ['VITE_MURF_TTS_API_KEY'],
}

const IMPLEMENTED_CLOUD_PROVIDERS = new Set([
  'Azure Speech-to-Text',
  'Google Cloud STT',
  'Deepgram',
  'AWS Transcribe',
  'ElevenLabs STT',
  'Murf Falcon',
  'OpenAI Whisper API',
  'Gemini',
  'OpenAI API',
  'Azure Text-to-Speech',
  'Google Cloud TTS',
  'OpenAI TTS',
  'ElevenLabs TTS',
  'Amazon Polly',
  'Murf TTS',
])

function hasProviderKeys(provider) {
  const requiredEnvKeys = PROVIDER_ENV_KEYS[provider] || []
  if (!requiredEnvKeys.length) {
    return false
  }
  return requiredEnvKeys.every((envName) => String(ENV[envName] || '').trim())
}

function getMissingProviderKeys(provider) {
  const requiredEnvKeys = PROVIDER_ENV_KEYS[provider] || []
  return requiredEnvKeys.filter((envName) => !String(ENV[envName] || '').trim())
}

function getProviderFallbackNote(provider) {
  const hasKeys = hasProviderKeys(provider)
  const isImplemented = IMPLEMENTED_CLOUD_PROVIDERS.has(provider)

  if (!hasKeys) {
    const keyNames = PROVIDER_ENV_KEYS[provider]?.join(', ')
    return keyNames
      ? `Add ${keyNames} in frontend/.env to call ${provider}.`
      : `Add provider keys in frontend/.env to call ${provider}.`
  }

  if (!isImplemented) {
    return `${provider} keys are loaded from frontend/.env, but cloud adapter implementation is pending in this frontend-only demo.`
  }

  return `${provider} is ready with keys from frontend/.env.`
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function getMediaFormatFromBlob(audioBlob) {
  const normalizedType = String(audioBlob?.type || '').toLowerCase()
  if (normalizedType.includes('webm')) return 'webm'
  if (normalizedType.includes('ogg')) return 'ogg'
  if (normalizedType.includes('wav')) return 'wav'
  if (normalizedType.includes('mpeg') || normalizedType.includes('mp3')) return 'mp3'
  if (normalizedType.includes('flac')) return 'flac'
  if (normalizedType.includes('mp4')) return 'mp4'
  return 'webm'
}

async function blobToBase64(audioBlob) {
  const arrayBuffer = await audioBlob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(arrayBuffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function streamToText(streamLike) {
  if (!streamLike) {
    return ''
  }

  if (typeof streamLike.transformToString === 'function') {
    return streamLike.transformToString()
  }

  if (typeof streamLike.getReader === 'function') {
    const reader = streamLike.getReader()
    const chunks = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    const merged = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    return new TextDecoder('utf-8').decode(merged)
  }

  if (streamLike instanceof Blob) {
    return streamLike.text()
  }

  return String(streamLike)
}

function getAwsClientConfig() {
  return {
    region: ENV.VITE_AWS_REGION,
    credentials: {
      accessKeyId: ENV.VITE_AWS_POLLY_ACCESS_KEY_ID,
      secretAccessKey: ENV.VITE_AWS_POLLY_SECRET_ACCESS_KEY,
    },
  }
}

const initialPreferences = readStoredPreferences()

function readStoredPreferences() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return {
        userName: '',
        sttService: STT_OPTIONS[0] || '',
        aiService: AI_OPTIONS[0] || '',
        ttsService: TTS_OPTIONS[0] || '',
        elevenLabsVoiceId: ELEVENLABS_VOICE_ID,
        murfTtsVoiceId: MURF_TTS_VOICE_ID,
      }
    }

    const parsed = JSON.parse(stored)
    return {
      userName: typeof parsed.userName === 'string' ? parsed.userName : '',
      sttService: STT_OPTIONS.includes(parsed.sttService) ? parsed.sttService : STT_OPTIONS[0] || '',
      aiService: AI_OPTIONS.includes(parsed.aiService) ? parsed.aiService : AI_OPTIONS[0] || '',
      ttsService: TTS_OPTIONS.includes(parsed.ttsService) ? parsed.ttsService : TTS_OPTIONS[0] || '',
      elevenLabsVoiceId:
        typeof parsed.elevenLabsVoiceId === 'string' && parsed.elevenLabsVoiceId.trim()
          ? parsed.elevenLabsVoiceId
          : ELEVENLABS_VOICE_ID,
      murfTtsVoiceId:
        typeof parsed.murfTtsVoiceId === 'string' && parsed.murfTtsVoiceId.trim()
          ? parsed.murfTtsVoiceId
          : MURF_TTS_VOICE_ID,
    }
  } catch {
    return {
      userName: '',
      sttService: STT_OPTIONS[0] || '',
      aiService: AI_OPTIONS[0] || '',
      ttsService: TTS_OPTIONS[0] || '',
      elevenLabsVoiceId: ELEVENLABS_VOICE_ID,
      murfTtsVoiceId: MURF_TTS_VOICE_ID,
    }
  }
}

async function transcribeAudio(audioBlob, selectedProvider, fallbackTranscript) {
  if (selectedProvider === 'AWS Transcribe') {
    const missingKeys = getMissingProviderKeys(selectedProvider)
    if (missingKeys.length) {
      throw new Error(`AWS Transcribe missing required env keys: ${missingKeys.join(', ')}`)
    }
  }

  if (selectedProvider === 'OpenAI Whisper API' && hasProviderKeys(selectedProvider)) {
    const formData = new FormData()
    formData.append('file', new File([audioBlob], 'recording.webm', { type: audioBlob.type || 'audio/webm' }))
    formData.append('model', 'whisper-1')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`OpenAI Whisper request failed (${response.status})`)
    }

    const data = await response.json()
    return data.text?.trim() || ''
  }

  if (selectedProvider === 'Deepgram' && hasProviderKeys(selectedProvider)) {
    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
      method: 'POST',
      headers: {
        Authorization: `Token ${ENV.VITE_DEEPGRAM_API_KEY}`,
        'Content-Type': audioBlob.type || 'audio/webm',
      },
      body: audioBlob,
    })

    if (!response.ok) {
      throw new Error(`Deepgram request failed (${response.status})`)
    }

    const data = await response.json()
    return data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || ''
  }

  if (selectedProvider === 'AWS Transcribe' && hasProviderKeys(selectedProvider)) {
    const awsConfig = getAwsClientConfig()
    const s3Client = new S3Client(awsConfig)
    const transcribeClient = new TranscribeClient(awsConfig)
    const objectKey = `${AWS_TRANSCRIBE_PREFIX.replace(/\/$/, '')}/${Date.now()}-${Math.random().toString(36).slice(2)}.webm`
    const mediaFormat = getMediaFormatFromBlob(audioBlob)
    const audioBytes = new Uint8Array(await audioBlob.arrayBuffer())

    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: AWS_TRANSCRIBE_BUCKET,
          Key: objectKey,
          Body: audioBytes,
          ContentType: audioBlob.type || 'audio/webm',
        }),
      )
    } catch (err) {
      throw new Error(`AWS S3 upload failed: ${err?.message || 'unknown error'}`)
    }

    const jobName = `frontend-transcribe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const outputKey = `${AWS_TRANSCRIBE_PREFIX.replace(/\/$/, '')}/transcripts/${jobName}.json`

    try {
      await transcribeClient.send(
        new StartTranscriptionJobCommand({
          TranscriptionJobName: jobName,
          LanguageCode: 'en-US',
          MediaFormat: mediaFormat,
          Media: {
            MediaFileUri: `s3://${AWS_TRANSCRIBE_BUCKET}/${objectKey}`,
          },
          OutputBucketName: AWS_TRANSCRIBE_BUCKET,
          OutputKey: outputKey,
        }),
      )
    } catch (err) {
      throw new Error(`AWS Transcribe start failed: ${err?.message || 'unknown error'}`)
    }

    let jobStatus = ''
    let transcriptUri = ''
    for (let i = 0; i < 30; i += 1) {
      await sleep(2000)
      let statusResponse
      try {
        statusResponse = await transcribeClient.send(
          new GetTranscriptionJobCommand({
            TranscriptionJobName: jobName,
          }),
        )
      } catch (err) {
        throw new Error(`AWS Transcribe status failed: ${err?.message || 'unknown error'}`)
      }
      const job = statusResponse.TranscriptionJob
      jobStatus = job?.TranscriptionJobStatus || ''
      if (jobStatus === 'COMPLETED') {
        transcriptUri = job?.Transcript?.TranscriptFileUri || ''
        break
      }
      if (jobStatus === 'FAILED') {
        throw new Error(job?.FailureReason || 'AWS Transcribe job failed.')
      }
    }

    if (!transcriptUri) {
      throw new Error(
        jobStatus
          ? `AWS Transcribe timed out while status=${jobStatus}.`
          : 'AWS Transcribe timed out before transcript became available.',
      )
    }

    let transcriptData
    try {
      const transcriptObject = await s3Client.send(
        new GetObjectCommand({
          Bucket: AWS_TRANSCRIBE_BUCKET,
          Key: outputKey,
        }),
      )
      const transcriptText = await streamToText(transcriptObject.Body)
      transcriptData = JSON.parse(transcriptText || '{}')
    } catch (err) {
      const details = err?.message || 'unknown error'
      throw new Error(
        `Failed to read AWS transcript from s3://${AWS_TRANSCRIBE_BUCKET}/${outputKey}: ${details}. ` +
          `If this persists, allow GET in S3 CORS for your app origin.`,
      )
    }

    return transcriptData.results?.transcripts?.[0]?.transcript?.trim() || ''
  }

  if (selectedProvider === 'ElevenLabs STT' && hasProviderKeys(selectedProvider)) {
    const formData = new FormData()
    formData.append('file', new File([audioBlob], 'recording.webm', { type: audioBlob.type || 'audio/webm' }))
    formData.append('model_id', 'scribe_v1')
    formData.append('language_code', 'en')

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`ElevenLabs STT request failed (${response.status})`)
    }

    const data = await response.json()
    return data.text?.trim() || ''
  }

  if (selectedProvider === 'Google Cloud STT' && hasProviderKeys(selectedProvider)) {
    const base64Audio = await blobToBase64(audioBlob)
    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${ENV.VITE_GOOGLE_CLOUD_STT_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: {
            encoding: 'WEBM_OPUS',
            languageCode: 'en-US',
            enableAutomaticPunctuation: true,
          },
          audio: { content: base64Audio },
        }),
      },
    )

    if (!response.ok) {
      throw new Error(`Google Cloud STT request failed (${response.status})`)
    }

    const data = await response.json()
    return data.results?.map((result) => result.alternatives?.[0]?.transcript || '').join(' ').trim()
  }

  if (selectedProvider === 'Azure Speech-to-Text' && hasProviderKeys(selectedProvider)) {
    const azureSttUrl =
      `https://${ENV.VITE_AZURE_STT_REGION}.stt.speech.microsoft.com/` +
      'speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple'

    const response = await fetch(azureSttUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': ENV.VITE_AZURE_STT_KEY,
        'Content-Type': audioBlob.type || 'audio/webm; codecs=opus',
      },
      body: audioBlob,
    })

    if (!response.ok) {
      throw new Error(`Azure STT request failed (${response.status})`)
    }

    const data = await response.json()
    return data.DisplayText?.trim() || ''
  }

  if (selectedProvider === 'Murf Falcon' && hasProviderKeys(selectedProvider)) {
    const formData = new FormData()
    formData.append('file', new File([audioBlob], 'recording.webm', { type: audioBlob.type || 'audio/webm' }))
    formData.append('voice_id', MURF_FALCON_VOICE_ID)
    formData.append('return_transcription', 'true')

    const response = await fetch(`${MURF_API_BASE_URL}/v1/voice-changer/convert`, {
      method: 'POST',
      headers: {
        'api-key': ENV.VITE_MURF_FALCON_API_KEY,
      },
      body: formData,
    })

    if (!response.ok) {
      let detail = ''
      try {
        const errData = await response.json()
        detail =
          errData?.detail?.message ||
          errData?.message ||
          errData?.error?.message ||
          JSON.stringify(errData)
      } catch {
        // Ignore body parse failures and use generic error.
      }
      throw new Error(
        detail
          ? `Murf Falcon STT request failed (${response.status}): ${detail}`
          : `Murf Falcon STT request failed (${response.status})`,
      )
    }

    const data = await response.json()
    return data.transcription?.trim() || ''
  }

  if (fallbackTranscript?.trim() && selectedProvider !== 'AWS Transcribe') {
    return fallbackTranscript.trim()
  }

  throw new Error(`No transcript captured. ${getProviderFallbackNote(selectedProvider)}`)
}

function canUseBrowserSttFallback(provider) {
  // Keep AWS strict so failures are visible instead of looking like AWS succeeded.
  return provider !== 'AWS Transcribe'
}

async function generateAiResponse(prompt, selectedProvider, userName) {
  if (selectedProvider === 'Gemini' && hasProviderKeys(selectedProvider) && GEMINI_API_KEY) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `User: ${userName}\nPrompt: ${prompt}` }] }],
        }),
      },
    )

    if (!response.ok) {
      throw new Error(`Gemini request failed (${response.status})`)
    }

    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No response from Gemini.'
  }

  if (selectedProvider === 'OpenAI API' && hasProviderKeys(selectedProvider) && OPENAI_API_KEY) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant for a multi-service voice chatbot demo.',
          },
          {
            role: 'user',
            content: `User name: ${userName}\nPrompt: ${prompt}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API request failed (${response.status})`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content?.trim() || 'No response from OpenAI API.'
  }

  return `Hi ${userName || DEFAULT_USER_NAME}! I heard: "${prompt}". ${getProviderFallbackNote(selectedProvider)}`
}

function playAudioBlob(audioBlob) {
  return new Promise((resolve, reject) => {
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)

    const clear = () => {
      URL.revokeObjectURL(audioUrl)
    }

    audio.onended = () => {
      clear()
      resolve()
    }

    audio.onerror = () => {
      clear()
      reject(new Error('Audio playback failed'))
    }

    audio.play().catch((err) => {
      clear()
      reject(err)
    })
  })
}

async function audioStreamToBlob(audioStream, mimeType = 'audio/mpeg') {
  if (!audioStream) {
    throw new Error('No audio stream received.')
  }

  if (audioStream instanceof Blob) {
    return audioStream
  }

  if (audioStream instanceof Uint8Array) {
    return new Blob([audioStream], { type: mimeType })
  }

  if (audioStream?.transformToByteArray) {
    const byteArray = await audioStream.transformToByteArray()
    return new Blob([byteArray], { type: mimeType })
  }

  if (audioStream?.getReader) {
    const reader = audioStream.getReader()
    const chunks = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      chunks.push(value)
    }
    return new Blob(chunks, { type: mimeType })
  }

  return new Blob([audioStream], { type: mimeType })
}

function speakWithBrowserTts(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve()
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1
    utterance.pitch = 1
    utterance.onend = resolve
    utterance.onerror = resolve
    window.speechSynthesis.speak(utterance)
  })
}

async function synthesizeSpeech(text, selectedProvider, options = {}) {
  const elevenLabsVoiceId = options.elevenLabsVoiceId?.trim() || ELEVENLABS_VOICE_ID
  const murfTtsVoiceId = options.murfTtsVoiceId?.trim() || MURF_TTS_VOICE_ID
  if (selectedProvider === 'Amazon Polly' && hasProviderKeys(selectedProvider)) {
    const pollyClient = new PollyClient(getAwsClientConfig())
    const pollyResponse = await pollyClient.send(
      new SynthesizeSpeechCommand({
        OutputFormat: 'mp3',
        VoiceId: AWS_POLLY_VOICE_ID,
        Text: text,
        Engine: 'neural',
      }),
    )

    const audioBlob = await audioStreamToBlob(pollyResponse.AudioStream, 'audio/mpeg')
    await playAudioBlob(audioBlob)
    return
  }

  if (selectedProvider === 'Murf TTS' && hasProviderKeys(selectedProvider)) {
    const response = await fetch(`${MURF_API_BASE_URL}/v1/speech/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': ENV.VITE_MURF_TTS_API_KEY,
      },
      body: JSON.stringify({
        text,
        voiceId: murfTtsVoiceId,
        format: 'MP3',
      }),
    })

    if (!response.ok) {
      let detail = ''
      try {
        const errData = await response.json()
        detail =
          errData?.detail?.message ||
          errData?.message ||
          errData?.error?.message ||
          JSON.stringify(errData)
      } catch {
        // Ignore body parse failures and use generic error.
      }
      throw new Error(
        detail
          ? `Murf TTS request failed (${response.status}): ${detail}`
          : `Murf TTS request failed (${response.status})`,
      )
    }

    const data = await response.json()
    if (data.encodedAudio) {
      const audioBlob = await (await fetch(`data:audio/mp3;base64,${data.encodedAudio}`)).blob()
      await playAudioBlob(audioBlob)
      return
    }

    if (!data.audioFile) {
      throw new Error('Murf TTS returned no audio file.')
    }

    const audioResponse = await fetch(data.audioFile)
    if (!audioResponse.ok) {
      throw new Error(`Unable to fetch Murf audio file (${audioResponse.status})`)
    }

    const audioBlob = await audioResponse.blob()
    await playAudioBlob(audioBlob)
    return
  }

  if (selectedProvider === 'Google Cloud TTS' && hasProviderKeys(selectedProvider)) {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${ENV.VITE_GOOGLE_CLOUD_TTS_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
          audioConfig: { audioEncoding: 'MP3' },
        }),
      },
    )

    if (!response.ok) {
      throw new Error(`Google Cloud TTS request failed (${response.status})`)
    }

    const data = await response.json()
    if (!data.audioContent) {
      throw new Error('Google Cloud TTS returned no audio.')
    }

    const audioBlob = await (await fetch(`data:audio/mp3;base64,${data.audioContent}`)).blob()
    await playAudioBlob(audioBlob)
    return
  }

  if (selectedProvider === 'Azure Text-to-Speech' && hasProviderKeys(selectedProvider)) {
    const escapedText = text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;')
    const ssml = `
      <speak version='1.0' xml:lang='en-US'>
        <voice xml:lang='en-US' xml:gender='Female' name='en-US-JennyNeural'>
          ${escapedText}
        </voice>
      </speak>
    `.trim()

    const response = await fetch(
      `https://${ENV.VITE_AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': ENV.VITE_AZURE_TTS_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
        },
        body: ssml,
      },
    )

    if (!response.ok) {
      throw new Error(`Azure TTS request failed (${response.status})`)
    }

    const audioBlob = await response.blob()
    await playAudioBlob(audioBlob)
    return
  }

  if (selectedProvider === 'OpenAI TTS' && hasProviderKeys(selectedProvider) && OPENAI_API_KEY) {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        input: text,
        format: 'mp3',
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI TTS request failed (${response.status})`)
    }

    const audioBlob = await response.blob()
    await playAudioBlob(audioBlob)
    return
  }

  if (selectedProvider === 'ElevenLabs TTS' && hasProviderKeys(selectedProvider) && ELEVENLABS_API_KEY) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_TTS_MODEL,
      }),
    })

    if (!response.ok) {
      let detail = ''
      try {
        const errData = await response.json()
        detail = errData?.detail?.message || ''
      } catch {
        // Ignore body parse failures and use generic error.
      }
      throw new Error(
        detail
          ? `ElevenLabs TTS request failed (${response.status}): ${detail}`
          : `ElevenLabs TTS request failed (${response.status})`,
      )
    }

    const audioBlob = await response.blob()
    await playAudioBlob(audioBlob)
    return
  }

  await speakWithBrowserTts(text)
}

function App() {
  const [userName, setUserName] = useState(initialPreferences.userName)
  const [sttService, setSttService] = useState(initialPreferences.sttService)
  const [aiService, setAiService] = useState(initialPreferences.aiService)
  const [ttsService, setTtsService] = useState(initialPreferences.ttsService)
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState(
    initialPreferences.elevenLabsVoiceId || ELEVENLABS_VOICE_ID,
  )
  const [murfTtsVoiceId, setMurfTtsVoiceId] = useState(
    initialPreferences.murfTtsVoiceId || MURF_TTS_VOICE_ID,
  )
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Choose your STT, AI and TTS providers, then click Start Recording to begin.',
      provider: 'System',
      time: new Date().toLocaleTimeString(),
    },
  ])
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [status, setStatus] = useState('Idle')
  const [error, setError] = useState('')

  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const recognitionRef = useRef(null)
  const recognitionTranscriptRef = useRef('')
  const chatBodyRef = useRef(null)
  const canRecord = Boolean(sttService && aiService && ttsService)

  useEffect(() => {
    if (sttService && STT_OPTIONS.includes(sttService)) {
      return
    }
    setSttService(STT_OPTIONS[0] || '')
  }, [sttService])

  useEffect(() => {
    if (aiService && AI_OPTIONS.includes(aiService)) {
      return
    }
    setAiService(AI_OPTIONS[0] || '')
  }, [aiService])

  useEffect(() => {
    if (ttsService && TTS_OPTIONS.includes(ttsService)) {
      return
    }
    setTtsService(TTS_OPTIONS[0] || '')
  }, [ttsService])

  useEffect(() => {
    if (elevenLabsVoiceId.trim()) {
      return
    }
    setElevenLabsVoiceId(ELEVENLABS_VOICE_ID)
  }, [elevenLabsVoiceId])

  useEffect(() => {
    if (murfTtsVoiceId.trim()) {
      return
    }
    setMurfTtsVoiceId(MURF_TTS_VOICE_ID)
  }, [murfTtsVoiceId])

  useEffect(() => {
    const preferences = {
      userName,
      sttService,
      aiService,
      ttsService,
      elevenLabsVoiceId,
      murfTtsVoiceId,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  }, [userName, sttService, aiService, ttsService, elevenLabsVoiceId, murfTtsVoiceId])

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight
    }
  }, [messages, status, error])

  useEffect(() => {
    return () => {
      stopSpeechRecognition()
      stopAudioStream()
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const addMessage = (role, content, provider) => {
    setMessages((prev) => [
      ...prev,
      {
        role,
        content,
        provider,
        time: new Date().toLocaleTimeString(),
      },
    ])
  }

  function stopSpeechRecognition() {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
  }

  function stopAudioStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  const startRecording = async () => {
    if (isProcessing || isRecording || !canRecord) {
      if (!canRecord) {
        setError('Enable at least one STT, AI service and TTS service in frontend/.env.')
      }
      return
    }

    setError('')
    setStatus('Listening...')
    recognitionTranscriptRef.current = ''

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        stopSpeechRecognition()
        stopAudioStream()
        setIsRecording(false)

        const recordedBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (!recordedBlob.size) {
          setStatus('Idle')
          setError('No audio was captured.')
          return
        }

        await handleConversationFlow(recordedBlob)
      }

      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (Recognition) {
        const recognition = new Recognition()
        recognition.lang = 'en-US'
        recognition.continuous = true
        recognition.interimResults = true
        recognition.onresult = (event) => {
          let transcript = ''
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            transcript += event.results[i][0].transcript
          }
          recognitionTranscriptRef.current = transcript
        }
        recognition.onerror = () => {
          // Keep the recording flow running even if speech recognition fails.
        }
        recognition.start()
        recognitionRef.current = recognition
      }

      recorder.start()
      setIsRecording(true)
    } catch (err) {
      setStatus('Idle')
      setError(err.message || 'Microphone permission was denied.')
      stopSpeechRecognition()
      stopAudioStream()
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return
    }

    mediaRecorderRef.current.stop()
    setStatus('Processing recording...')
  }

  const handleConversationFlow = async (audioBlob) => {
    setIsProcessing(true)
    setError('')

    try {
      setStatus(`Transcribing via ${sttService}...`)
      let transcript = ''
      let transcriptProviderUsed = sttService
      try {
        transcript = await transcribeAudio(audioBlob, sttService, recognitionTranscriptRef.current)
      } catch (sttError) {
        if (recognitionTranscriptRef.current.trim() && canUseBrowserSttFallback(sttService)) {
          transcript = recognitionTranscriptRef.current.trim()
          transcriptProviderUsed = 'Browser SpeechRecognition'
          addMessage(
            'assistant',
            `Cloud STT failed (${sttError.message || 'unknown error'}). Used browser speech transcript fallback.`,
            'System',
          )
        } else {
          throw sttError
        }
      }
      if (!transcript) {
        throw new Error('Transcription was empty.')
      }

      addMessage('user', transcript, transcriptProviderUsed)

      setStatus(`Generating answer via ${aiService}...`)
      const assistantResponse = await generateAiResponse(
        transcript,
        aiService,
        userName.trim() || DEFAULT_USER_NAME,
      )
      addMessage('assistant', assistantResponse, aiService)

      setStatus(`Synthesizing voice via ${ttsService}...`)
      try {
        await synthesizeSpeech(assistantResponse, ttsService, {
          elevenLabsVoiceId,
          murfTtsVoiceId,
        })
      } catch (ttsError) {
        await speakWithBrowserTts(assistantResponse)
        addMessage(
          'assistant',
          `Cloud TTS failed (${ttsError.message || 'unknown error'}). Played browser speech fallback.`,
          'System',
        )
      }

      setStatus('Done')
    } catch (err) {
      setError(err.message || 'Conversation pipeline failed.')
      setStatus('Idle')
    } finally {
      setIsProcessing(false)
      recognitionTranscriptRef.current = ''
    }
  }

  return (
    <div className="container-fluid h-100 app-wrapper">
      <div className="row h-100">
        <section className="col-12 col-lg-4 border-end p-3 overflow-auto">
          <h4 className="mb-3">Voice Chat Setup</h4>

          <div className="mb-3">
            <label htmlFor="userName" className="form-label">
              User Name
            </label>
            <input
              id="userName"
              type="text"
              className="form-control"
              placeholder="Type your name"
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
            />
          </div>

          <div className="mb-3">
            <label htmlFor="stt" className="form-label">
              Speech-to-Text Service
            </label>
            <select
              id="stt"
              className="form-select"
              value={sttService}
              onChange={(event) => setSttService(event.target.value)}
              disabled={!STT_OPTIONS.length}
            >
              {STT_OPTIONS.length ? (
                STT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))
              ) : (
                <option value="">No STT service enabled</option>
              )}
            </select>
          </div>

          <div className="mb-3">
            <label htmlFor="aiService" className="form-label">
              AI Service
            </label>
            <select
              id="aiService"
              className="form-select"
              value={aiService}
              onChange={(event) => setAiService(event.target.value)}
              disabled={!AI_OPTIONS.length}
            >
              {AI_OPTIONS.length ? (
                AI_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))
              ) : (
                <option value="">No AI service enabled</option>
              )}
            </select>
          </div>

          <div className="mb-4">
            <label htmlFor="tts" className="form-label">
              Text-to-Speech Service
            </label>
            <select
              id="tts"
              className="form-select"
              value={ttsService}
              onChange={(event) => setTtsService(event.target.value)}
              disabled={!TTS_OPTIONS.length}
            >
              {TTS_OPTIONS.length ? (
                TTS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))
              ) : (
                <option value="">No TTS service enabled</option>
              )}
            </select>
            {ttsService === 'ElevenLabs TTS' && (
              <div className="mt-2">
                <label htmlFor="elevenLabsVoiceId" className="form-label mb-1">
                  ElevenLabs Voice ID
                </label>
                <input
                  id="elevenLabsVoiceId"
                  type="text"
                  className="form-control"
                  value={elevenLabsVoiceId}
                  onChange={(event) => setElevenLabsVoiceId(event.target.value)}
                  placeholder={ELEVENLABS_VOICE_ID}
                />
                <div className="form-text">
                  Default is loaded from <code>VITE_ELEVENLABS_VOICE_ID</code> in <code>frontend/.env</code>.
                </div>
              </div>
            )}
            {ttsService === 'Murf TTS' && (
              <div className="mt-2">
                <label htmlFor="murfTtsVoiceId" className="form-label mb-1">
                  Murf TTS Voice ID
                </label>
                <input
                  id="murfTtsVoiceId"
                  type="text"
                  className="form-control"
                  value={murfTtsVoiceId}
                  onChange={(event) => setMurfTtsVoiceId(event.target.value)}
                  placeholder={MURF_TTS_VOICE_ID}
                />
                <div className="form-text">
                  Default is loaded from <code>VITE_MURF_TTS_VOICE_ID</code> in <code>frontend/.env</code>.
                </div>
              </div>
            )}
          </div>

          <div className="d-grid gap-2 mb-3">
            {!isRecording ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={startRecording}
                disabled={isProcessing || !canRecord}
              >
                Start Recording
              </button>
            ) : (
              <button type="button" className="btn btn-outline-danger" onClick={stopRecording}>
                Stop Recording
              </button>
            )}
          </div>

          <div className="small text-secondary mb-2">
            <strong>Status:</strong> {status}
          </div>
          {error && <div className="alert alert-danger py-2 mb-2">{error}</div>}
          {!canRecord && (
            <div className="alert alert-warning py-2 mb-2">
              Enable at least one STT, AI and TTS option in <code>frontend/.env</code> to record.
            </div>
          )}

          <div className="alert alert-light border small mb-0">
            Cloud requests are used when related API keys are configured in <code>frontend/.env</code>.
            Otherwise, local browser fallbacks are used so the app still works end-to-end.
          </div>
        </section>

        <section className="col-12 col-lg-8 p-0 h-100">
          <div className="card h-100 rounded-0">
            <div className="card-header">
              Chatbox
              <span className="ms-2 badge text-bg-secondary">{userName.trim() || DEFAULT_USER_NAME}</span>
            </div>
            <div className="card-body chat-body" ref={chatBodyRef}>
              {messages.map((message, index) => (
                <div
                  key={`${message.time}-${index}`}
                  className={`d-flex mb-3 ${message.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`}
                >
                  <div className={`message-bubble ${message.role === 'user' ? 'message-user' : 'message-assistant'}`}>
                    <div className="small text-muted mb-1">
                      {message.role === 'user' ? userName.trim() || DEFAULT_USER_NAME : 'Assistant'} via {message.provider}
                    </div>
                    <div>{message.content}</div>
                    <div className="small text-muted mt-1">{message.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
