// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SendBulkEmailCommand } from "npm:@aws-sdk/client-sesv2";
import { Utils } from "../_shared/utils.ts";
import { AwsClient } from "../_shared/aws.ts";
const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

Deno.serve(async (req)=>{
    const now = new Date().toISOString();
    const { data: campaigns, error: campaignsErr } = await supabase
        .from("campaigns")
        .select("id, subject, content_html, content_text, scheduled_at")
        .lte("scheduled_at", now)
        .eq('status', 'SCHEDULED');

    for (const campaign of campaigns) {
        try{
            //making the campaign to be processing
            await supabase.from("campaigns").update({ status: "PROCESSING" }).eq("id", campaign.id);
            const tenantId = campaign.tenant_id


            //Create a AWS SES Client
            const awsClient = await AwsClient.create(supabase, tenantId);

            //Get all campaigns
            const { data: campaignRecipient, error: tenantErr } = await supabase.from("campaign_recipients").select("id, campaign_id, email").eq("tenant_id", tenantId).single();
        
            //mapping entires
            const entries = AwsClient.createBulkEmailEntries(
                [campaignRecipient],
                tenantId,
                campaign.id
            );
            //chunking entries and sending bulk email
            const chunks = Utils.chunkArray(entries, 50);
            const results = [];

            for (const chunk of chunks){
                
                const input = AwsClient.createBulkEmailInput({
                    fromEmail: 'cimpro.app@gmail.com',
                    entries: chunk,
                    configurationSetName: 'CodeCabin',
                    subject: campaign.subject,
                    htmlContent: campaign.content_html,
                    textContent: campaign.content_text
                });

                const cmd = new SendBulkEmailCommand(input);
                const res = await awsClient.send(cmd);
                results.push(res);
            }
        }catch(err){
            console.error("Error processing campaign:", campaign.id, err);
            //update the campaign status to failed
            await supabase.from("campaigns").update({ status: "FAILED" }).eq("id", campaign.id);
            continue;
        }
    }

  return new Response(JSON.stringify({
    success: true,
    data: []
  }));
});
