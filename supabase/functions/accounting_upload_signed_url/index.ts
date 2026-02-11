import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { cleanName, corsHeaders, getAdminClient, json, requireEditorPin } from "../_accounting_shared/utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const pin = String(body?.pin || "").trim();
    const filename = String(body?.filename || "file.bin");
    const contentType = String(body?.contentType || "application/octet-stream");
    const client = getAdminClient();
    await requireEditorPin(client, pin);

    const now = new Date();
    const y = String(now.getUTCFullYear());
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const path = `accounting/${y}/${m}/${crypto.randomUUID()}.${cleanName(ext || "bin")}`;

    const { data, error } = await client.storage.from("portal").createSignedUploadUrl(path);
    if (error) throw error;
    return json({ path, uploadUrl: data.signedUrl, token: data.token, contentType });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});
