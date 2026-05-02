const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SMART_PROMPT = `You are an expert SVG template designer for the KROBAR visual template system.

Analyze this image carefully. It shows a diagram, chart, framework, or visual structure.

Your task: recreate it as a clean, well-structured SVG template with EDITABLE PLACEHOLDER SLOTS.

Rules:
- Output ONLY valid SVG markup (no markdown, no explanation, no code fences)
- Use a viewBox of "0 0 800 600" 
- Use clean geometric shapes, not traced paths
- Identify logical text areas and replace them with placeholder text using {{slot_name}} syntax
- Common slots: {{title}}, {{subtitle}}, {{item_1}}, {{label_left}}, {{label_right}}, etc.
- Use simple, semantic slot names in snake_case
- Keep colors as fill attributes using hex values
- Include a white or light background rectangle
- Make the SVG look professional and clean — this is a template, not a pixel-perfect copy
- Preserve the structural layout and proportions of the original
- Add reasonable padding and spacing

The SVG must be self-contained and render correctly in a browser.`;

const TRACE_PROMPT = `You are an expert at converting raster images to SVG vector graphics.

Analyze this image and recreate it as faithfully as possible in SVG format.

Rules:
- Output ONLY valid SVG markup (no markdown, no explanation, no code fences)
- Use a viewBox of "0 0 800 600"
- Reproduce shapes, colors, text, and layout as closely as possible to the original
- Use appropriate SVG elements: rect, circle, ellipse, path, text, line, polygon
- Preserve exact colors using hex values
- Reproduce text content as-is using <text> elements with appropriate font sizes
- Maintain proportions and spatial relationships
- Keep the SVG clean and well-structured
- Do NOT add placeholder slots or template syntax — this is a faithful reproduction

The SVG must be self-contained and render correctly in a browser.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { image_base64, mode, hint } = (await req.json()) as {
      image_base64?: string;
      mode?: "smart" | "trace";
      hint?: string;
    };

    if (!image_base64) {
      return json({ error: "image_base64 is required" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    }

    const chosenMode = mode || "smart";
    let systemPrompt = chosenMode === "smart" ? SMART_PROMPT : TRACE_PROMPT;

    if (hint && chosenMode === "smart") {
      systemPrompt += `\n\nAdditional context from the user about this template: ${hint}`;
    }

    // Determine mime type from base64 header or default to png
    let mimeType = "image/png";
    let cleanBase64 = image_base64;
    if (image_base64.startsWith("data:")) {
      const match = image_base64.match(/^data:(image\/\w+);base64,/);
      if (match) {
        mimeType = match[1];
        cleanBase64 = image_base64.replace(/^data:image\/\w+;base64,/, "");
      }
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    chosenMode === "smart"
                      ? "Analyze this image and create a KROBAR SVG template with editable slots. Output only SVG."
                      : "Trace this image as faithfully as possible into SVG. Output only SVG.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${cleanBase64}`,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return json({ error: "Trop de requêtes, réessayez dans un moment." }, 429);
      }
      if (response.status === 402) {
        return json({ error: "Crédits AI insuffisants." }, 402);
      }
      return json({ error: "Erreur du service IA" }, 502);
    }

    const data = await response.json();
    let svgContent =
      data.choices?.[0]?.message?.content || "";

    // Clean up: remove markdown code fences if present
    svgContent = svgContent
      .replace(/^```(?:svg|xml)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    // Extract slots from {{slot_name}} patterns
    const slotMatches = svgContent.matchAll(/\{\{(\w+)\}\}/g);
    const slots = [...new Set([...slotMatches].map((m) => m[1]))];

    return json({
      svg: svgContent,
      mode: chosenMode,
      slots,
      slot_count: slots.length,
    });
  } catch (error) {
    console.error("png-to-svg error:", error);
    const message =
      error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});
