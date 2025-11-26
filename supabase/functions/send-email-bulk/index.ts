// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SendBulkEmailCommand } from "npm:@aws-sdk/client-sesv2";
import { Utils } from "../_shared/utils.ts";
import { AwsClient } from "../_shared/aws.ts";

const supabaseURL = Deno.env.get("SUPABASE_URL")
const supabase_service_role_key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseURL, supabase_service_role_key);
function runInBackground(promise: Promise<any>) {
    try {
        (Deno as any).core.opSync("op_runtime_message", { 
            action: "set_promise_wait_for", 
            promise: promise 
        });
    } catch (e) {
        console.warn("Failed to set waitUntil using Deno.core.opSync. Background job will not be guaranteed.", e);
        promise.catch(err => console.error("Background job failed without guaranteed completion:", err));
    }
}

Deno.serve(async (req)=>{
     const { data: queuedCampaigns, error } = await supabase.rpc("read_bulk_email_chunks", {
        vt_seconds: 1, //hide for 5 minutes 
        batch_size: 1
    });

    console.log("queuedCampaigns:", queuedCampaigns);

    if(queuedCampaigns){
        const payload = queuedCampaigns[0];
        const {tenant_id:tenantId, campaign_id:campaignId, recipients} = payload.message;

        const awsClient = await AwsClient.create(supabase, tenantId);

        const sendEmailChunkPromise = (async () => {
            console.log(`Starting background send for Chunk: ${payload.msg_id}. Recipients: ${recipients}`);
            
            const entries = AwsClient.createBulkEmailEntries(
                recipients,
                tenantId,
                campaignId
            );
            const { data: campaign, error: tenantErr } = await supabase.from("campaigns").select("id, subject, content_html, content_text").eq("id", campaignId).single();

            const input = AwsClient.createBulkEmailInput({
                fromEmail: 'cimpro.app@gmail.com',
                entries: entries,
                configurationSetName: 'CodeCabin',
                subject: campaign.subject,
                htmlContent: campaign.content_html,
                textContent: campaign.content_text
            });
            const cmd = new SendBulkEmailCommand(input);
            const res = await awsClient.send(cmd);
            
            console.log('========')
            console.log(res)
            console.log('========')
        })();

        runInBackground(sendEmailChunkPromise);
    }
    return new Response(JSON.stringify({
        success: true,
        data: []
    }));
});
