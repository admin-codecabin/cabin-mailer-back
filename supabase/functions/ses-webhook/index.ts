// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
Deno.serve(async (req)=>{
  const res = await req.json();
  const campaign_recipient_ids = res.mail.tags.campaign_recipient_id;
  for (const campaign_recipient_id of campaign_recipient_ids){
    console.log("campaign_recipient_id:", campaign_recipient_id);
    const { data: recipient } = await supabase.from("campaign_recipients").select('id, campaign_id, tenant_id').eq('id', campaign_recipient_id).single();
    console.log("recipient:", recipient);
    if (recipient) {
      const eventType = res.eventType.toUpperCase();
      console.log("eventType", eventType);
      const { data: campaign_event, error: campaigntErr } = await supabase.from("campaign_recipient_events").insert({
        campaign_recipient_id: recipient.id,
        campaign_id: recipient.campaign_id,
        tenant_id: recipient.tenant_id,
        event: eventType,
        raw_data: recipient
      });
      console.log("campaigntErr", campaigntErr);
      console.log("campaign_event:", campaign_event);
    }
  }
  return new Response(JSON.stringify(res), {
    headers: {
      'Content-Type': 'application/json',
      'Connection': 'keep-alive'
    }
  });
});
