# AssetMaster feature request delivery

The PHP endpoint sends through Amazon SES SMTP with required STARTTLS on port 587, certificate verification, and TLS 1.2 or newer. The destination and SES credentials stay outside the public document root. No local sendmail service or third-party mail SDK is needed.

Create `/home/ubuntu/migration/private/assetmaster-feedback.json`, readable only by the PHP worker and administrator:

```json
{"smtpHost":"email-smtp.YOUR_REGION.amazonaws.com","smtpUsername":"YOUR_SES_SMTP_USERNAME","smtpPassword":"YOUR_SES_SMTP_PASSWORD","rateLimitSecret":"YOUR_RANDOM_PRIVATE_SECRET","sender":"feedback@YOUR_VERIFIED_DOMAIN","recipient":"YOUR_PRIVATE_DESTINATION"}
```

Use SES SMTP credentials for the selected region, not an AWS console password or the temporary local AWS CLI login. The sender must be verified in that region. If SES is in the sandbox, the recipient must also be verified. See [AWS SMTP setup](https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html) and [SES sandbox requirements](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

Never place this configuration in public/, dist/, an Android bundle, VITE variables, or source control. Set ASSETMASTER_FEEDBACK_CONFIG if a different private path is needed. The private directory must be writable by PHP for short-lived rate records. PHP curl with SMTP/STARTTLS support, mbstring, and outbound port 587 are required.

Run `powershell -File scripts/test-feature-request.ps1` with local PHP (or add `-Remote` to use the configured host without deploying), `npm run verify`, and `npm run feedback:check`. Tests use injected delivery callbacks and do not send mail. Backend tests cover validation, unavailable configuration, rate limits, duplicate submissions, delivery failure, and successful acceptance.

Deploy only after a commit. A controlled live test must confirm SES acceptance and inbox arrival separately. SMTP acceptance alone does not prove inbox delivery. The UI reports unavailable until private configuration exists.

The recipient and a generated rate-limit secret are saved locally in ignored `.private/assetmaster-feedback.json`. Complete its SMTP host, credentials, and sender privately; never commit or copy it into the public build.
