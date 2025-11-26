// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SendBulkEmailCommand } from "npm:@aws-sdk/client-sesv2";
import { Utils } from "../_shared/utils.ts";
import { AwsClient } from "../_shared/aws.ts";

const supabaseURL = Deno.env.get("SUPABASE_URL")
const supabase_service_role_key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseURL, supabase_service_role_key);

Deno.serve(async (req)=>{
    const now = new Date().toISOString();

    console.log("now:", now)
    const { data: campaigns, error: campaignsErr } = await supabase
        .from("campaigns")
        .select("id, subject, content_html, content_text, scheduled_at, tenant_id")
        .lte("scheduled_at", now)
        .eq('status', 'SCHEDULED');

    console.log("all: campaigns to process:", campaigns);
    for (const campaign of campaigns) {
        try{
            console.log('campaign:', campaign)
            //making the campaign to be processing
            await supabase.from("campaigns").update({ status: "PROCESSING" }).eq("id", campaign.id);
            const tenantId = campaign.tenant_id
            
            // //Create a AWS SES Client
            // const awsClient = await AwsClient.create(supabase, tenantId);

            //Get all campaign recipients
            const { data: campaignRecipients, error: tenantErr } = await supabase.from("campaign_recipients").select("id, email").eq("tenant_id", tenantId).eq("campaign_id", campaign.id);
        
            //mapping entires
            // const entries = AwsClient.createBulkEmailEntries(
            //     campaignRecipients,
            //     tenantId,
            //     campaign.id
            // );

            //chunking entries and sending bulk email
            const chunks = Utils.chunkArray(campaignRecipients, 50);
            for (const chunk of chunks){
                const _recipients = chunk.map((r) => (
                   {
                    id: r.id,
                    email: r.email
                   }
                ))
                const { data: adding_chunks_to_queue, error } = await supabase.rpc("enqueue_bulk_email_chunks", {
                    payload: {
                        campaign_id: campaign.id,
                        tenant_id: tenantId,
                        recipients: _recipients
                    },
                    delay_seconds: 0
                });
                console.log("result of adding chunk to queue:", adding_chunks_to_queue);
            }
        }catch(err){
            console.error("Error processing campaign:", campaign.id, err);
            //update the campaign status to failed
            await supabase.from("campaigns").update({ status: "FAILED" }).eq("id", campaign.id);
            continue;
        }


        await supabase.from("campaigns").update({ status: "SENT" }).eq("id", campaign.id);
    }

  

  return new Response(JSON.stringify({
    success: true,
    data: []
  }));
});
