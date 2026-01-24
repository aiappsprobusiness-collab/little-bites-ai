import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured. Add it in Supabase Dashboard > Settings > Edge Functions > Secrets");
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

    // Convert base64 to blob
    const audioData = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
    
    // Определяем расширение файла на основе MIME типа
    let fileExtension = "webm";
    if (mimeType.includes("mp4")) {
      fileExtension = "mp4";
    } else if (mimeType.includes("ogg")) {
      fileExtension = "ogg";
    } else if (mimeType.includes("wav")) {
      fileExtension = "wav";
    } else if (mimeType.includes("webm")) {
      fileExtension = "webm";
    }
    
    // Create FormData for OpenAI Whisper API
    const formData = new FormData();
    const audioBlob = new Blob([audioData], { type: mimeType || "audio/webm" });
    formData.append("file", audioBlob, `audio.${fileExtension}`);
    formData.append("model", "whisper-1");
    formData.append("language", language);
    formData.append("response_format", "json");
    
    console.log(`Processing audio: ${audioData.length} bytes, type: ${mimeType}, extension: ${fileExtension}`);

    // Call OpenAI Whisper API
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI Whisper API error:", errorText);
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    return new Response(
      JSON.stringify({
        text: result.text || "",
        language: result.language || language,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Speech-to-text error:", error);
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
