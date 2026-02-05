import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SpeechToTextRequest {
  audioBase64: string;
  mimeType: string;
  language?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!DEEPSEEK_API_KEY) {
      throw new Error("DEEPSEEK_API_KEY is not configured. Add it in Supabase Dashboard > Settings > Edge Functions > Secrets");
    }

    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { audioBase64, mimeType, language = "ru" }: SpeechToTextRequest = await req.json();

    if (!audioBase64) {
      return new Response(
        JSON.stringify({ error: "audioBase64 is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Convert base64 to Uint8Array for audio processing
    const audioData = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
    
    // Since DeepSeek API doesn't support audio directly, we'll use a hybrid approach:
    // 1. First, transcribe audio using a free/open service (we'll use a simple approach)
    // 2. Then, optionally improve the transcription using DeepSeek
    
    // For transcription, we'll use a workaround with DeepSeek:
    // Convert audio to a description and use DeepSeek to process it
    // But this is not ideal - we need actual transcription
    
    // Better approach: Use a transcription service first, then DeepSeek for processing
    // Since we don't have OpenAI API key, let's try using DeepSeek creatively
    
    // Actually, the best approach is to use MediaRecorder on client side
    // and send the audio to a service that can transcribe it
    // Since DeepSeek doesn't support audio, we need another service
    
    // For now, let's create a simple transcription service using DeepSeek's chat API
    // with a prompt that asks to transcribe (but this won't work without actual audio processing)
    
    // Since DeepSeek doesn't support audio, we'll need to inform the user
    // and suggest using a different approach
    
    // However, we can use DeepSeek to improve transcribed text
    // So the flow would be: Audio -> Transcription Service -> DeepSeek (optional improvement)
    
    // For now, let's return an error explaining that DeepSeek doesn't support audio
    // and suggest using the existing Web Speech API or another service
    
    return new Response(
      JSON.stringify({
        error: "DeepSeek API не поддерживает распознавание речи напрямую",
        message: "DeepSeek API работает только с текстом. Для распознавания речи используйте встроенный Web Speech API браузера или другой сервис транскрипции.",
        suggestion: "Используйте встроенный Web Speech API (уже реализован) или настройте OpenAI Whisper API для транскрипции."
      }),
      {
        status: 501,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
    
  } catch (error: any) {
    console.error("DeepSeek speech-to-text error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to transcribe audio",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
