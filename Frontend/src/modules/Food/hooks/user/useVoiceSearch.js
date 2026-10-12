import { useCallback, useEffect, useRef, useState } from "react"

// Speech-to-text with live (interim) results so the UI can show what is being heard while the
// user is still speaking. onFinal receives the finished phrase.
export default function useVoiceSearch({ lang = "en-IN", onFinal } = {}) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState("")
  const recognitionRef = useRef(null)
  const finalRef = useRef("")
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  const SpeechRecognition =
    typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null
  const supported = Boolean(SpeechRecognition)

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* already stopped */
    }
  }, [])

  const cancel = useCallback(() => {
    finalRef.current = ""
    try {
      recognitionRef.current?.abort()
    } catch {
      /* already stopped */
    }
    setTranscript("")
    setIsListening(false)
  }, [])

  const start = useCallback(() => {
    if (!SpeechRecognition) {
      setError("Voice search is not supported in this browser.")
      return
    }
    setError("")
    setTranscript("")
    finalRef.current = ""

    const recognition = new SpeechRecognition()
    recognition.lang = lang
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setIsListening(true)
    recognition.onresult = (event) => {
      let interim = ""
      let finalText = ""
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += text
        else interim += text
      }
      if (finalText) finalRef.current = `${finalRef.current} ${finalText}`.trim()
      setTranscript(`${finalRef.current} ${interim}`.trim())
    }
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone permission is blocked. Allow it in your browser settings.")
      } else if (event.error === "no-speech") {
        setError("We didn't hear anything. Try again.")
      } else if (event.error !== "aborted") {
        setError("Voice search failed. Try again.")
      }
    }
    recognition.onend = () => {
      setIsListening(false)
      const phrase = finalRef.current.trim()
      finalRef.current = ""
      if (phrase) onFinalRef.current?.(phrase)
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      setError("Voice search could not start. Try again.")
    }
  }, [SpeechRecognition, lang])

  useEffect(() => () => recognitionRef.current?.abort?.(), [])

  return { supported, isListening, transcript, error, start, stop, cancel }
}
