// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SESv2Client, SendBulkEmailCommand } from "npm:@aws-sdk/client-sesv2";
const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
const initSES = async (tenantId)=>{
  const { data: tenant, error: tenantErr } = await supabase.from("tenants").select("id, organisation_id").eq("id", tenantId).single();
  const { data: provider, error: providerErr } = await supabase.from("organisation_credentials").select("provider, region, access_key_enc, secret_access_key_enc").eq("organisation_id", tenant.organisation_id).single();
  const secret = provider.secret_access_key_enc;
  console.log("provider-region:", provider.region);
  console.log("provider-access_key_enc:", provider.access_key_enc);
  console.log("provider-secret:", secret);
  const ses = new SESv2Client({
    region: provider.region,
    credentials: {
      accessKeyId: provider.access_key_enc,
      secretAccessKey: secret
    }
  });
  return ses;
};
const chunkArray = (arr, size)=>{
  const chunks = [];
  for(let i = 0; i < arr.length; i += size){
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};
Deno.serve(async (req)=>{
  const tenantId = "85f19850-a40a-4337-bc18-87794393b5ed";
  const ses = await initSES(tenantId);
  console.log(ses);
  const { data: campaignRecipient, error: tenantErr } = await supabase.from("campaign_recipients").select("id, campaign_id, email").eq("tenant_id", tenantId).single();
  const { data: campaign, error: campaigntErr } = await supabase.from("campaigns").select("id, subject, content_html, content_text").eq("id", campaignRecipient.campaign_id).single();
  // console.log(campaignRecipient);
  const entries = [
    campaignRecipient
  ].map((r)=>({
      Destination: {
        ToAddresses: [
          r.email
        ]
      },
      ReplacementTags: [
        {
          Name: "tenant_id",
          Value: tenantId
        },
        {
          Name: "campaign_id",
          Value: campaign.id
        },
        {
          Name: "campaign_recipient_id",
          Value: campaignRecipient.id
        }
      ]
    }));
  console.log("========");
  console.log(campaign);
  console.log("========");
  const chunks = chunkArray(entries, 50);
  const results = [];
  for (const chunk of chunks){
    console.log("chunk:", chunk);
    const input = {
      FromEmailAddress: 'cimpro.app@gmail.com',
      BulkEmailEntries: chunk,
      ...'CodeCabin' ? {
        ConfigurationSetName: 'CodeCabin'
      } : {},
      DefaultContent: {
        Template: {
          TemplateContent: {
            Subject: campaign.subject,
            Html: campaign.content_html,
            Text: campaign.content_text
          },
          TemplateData: "{}"
        }
      }
    };
    const cmd = new SendBulkEmailCommand(input);
    const res = await ses.send(cmd);
    results.push(res);
  }
  return new Response(JSON.stringify({
    success: true,
    data: results
  }));
});
