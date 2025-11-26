import { SESv2Client, SendBulkEmailCommand } from "npm:@aws-sdk/client-sesv2";

export class AwsClient {
    private ses: SESv2Client;
    
    constructor(ses: SESv2Client) {
        this.ses = ses;
    }
    
    static async create(supabase, tenantId) {
        const ses = await this.initSES(supabase, tenantId);
        return new AwsClient(ses);
    }

    static async initSES(supabase, tenantId) {
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
    }

    async send(command: SendBulkEmailCommand) {
        return await this.ses.send(command);
    }

    static createBulkEmailEntries(recipients: any[], tenantId: string, campaignId: string) {
        return recipients.map((r) => ({
            Destination: {
                ToAddresses: [r.email]
            },
            ReplacementTags: [
                {
                    Name: "tenant_id",
                    Value: tenantId
                },
                {
                    Name: "campaign_id",
                    Value: campaignId
                },
                {
                    Name: "campaign_recipient_id",
                    Value: r.id
                }
            ]
        }));
    }

    static createBulkEmailInput({
        fromEmail,
        entries,
        configurationSetName,
        subject,
        htmlContent,
        textContent
    }: {
        fromEmail: string;
        entries: any[];
        configurationSetName?: string;
        subject: string;
        htmlContent: string;
        textContent: string;
    }) {
        return {
            FromEmailAddress: fromEmail,
            BulkEmailEntries: entries,
            ...(configurationSetName ? {
                ConfigurationSetName: configurationSetName
            } : {}),
            DefaultContent: {
                Template: {
                    TemplateContent: {
                        Subject: subject,
                        Html: htmlContent,
                        Text: textContent
                    },
                    TemplateData: "{}"
                }
            }
        };
    }
}