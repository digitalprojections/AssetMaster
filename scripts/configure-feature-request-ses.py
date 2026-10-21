"""Provision one sender-only SES SMTP identity; never print credentials."""
import argparse
import base64
import hashlib
import hmac
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent

def aws(*arguments):
    result = subprocess.run(['aws', *arguments, '--output', 'json', '--no-cli-pager'], capture_output=True, text=True, encoding='utf-8')
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout) if result.stdout.strip() else {}

def smtp_password(secret, region):
    signature = ('AWS4' + secret).encode()
    for message in ['11111111', region, 'ses', 'aws4_request', 'SendRawEmail']:
        signature = hmac.new(signature, message.encode(), hashlib.sha256).digest()
    return base64.b64encode(bytes([4]) + signature).decode()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provision', action='store_true')
    parser.add_argument('--region', default='us-east-1')
    parser.add_argument('--sender', default='feedback@created.link')
    args = parser.parse_args()
    path = ROOT / '.private' / 'assetmaster-feedback.json'
    config = json.loads(path.read_text(encoding='utf-8'))
    account = aws('sts', 'get-caller-identity')['Account']
    sender_domain = args.sender.split('@')[1]
    policy = {'Version':'2012-10-17','Statement':[{
        'Effect':'Allow', 'Action':'ses:SendRawEmail',
        'Resource':f'arn:aws:ses:{args.region}:{account}:identity/{sender_domain}',
        'Condition':{'StringEquals':{'ses:FromAddress':args.sender}, 'ForAllValues:StringEquals':{'ses:Recipients':[config['recipient']]}}
    }]}
    policy_path = ROOT / '.private' / 'assetmaster-ses-policy.json'
    policy_path.write_text(json.dumps(policy, indent=2), encoding='utf-8')
    if not args.provision:
        print('Private sender-only policy prepared. Use --provision to create the SMTP identity.')
        return
    if config.get('smtpUsername') or config.get('smtpPassword'):
        raise RuntimeError('Private SMTP configuration already exists; no credentials were changed.')
    username = 'assetmaster-feature-request-smtp'
    # Refuse to replace or modify an existing IAM identity.
    aws('iam', 'create-user', '--user-name', username)
    access_key = None
    policy_created = False
    try:
        aws('iam', 'put-user-policy', '--user-name', username, '--policy-name', 'AssetMasterFeatureRequestsOnly', '--policy-document', 'file://' + str(policy_path))
        policy_created = True
        access_key = aws('iam', 'create-access-key', '--user-name', username)['AccessKey']
        config.update(smtpHost=f'email-smtp.{args.region}.amazonaws.com', smtpUsername=access_key['AccessKeyId'], smtpPassword=smtp_password(access_key['SecretAccessKey'], args.region), sender=args.sender)
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(config) + '\n', encoding='utf-8')
        temporary.replace(path)
    except Exception:
        if access_key:
            aws('iam', 'delete-access-key', '--user-name', username, '--access-key-id', access_key['AccessKeyId'])
        if policy_created:
            aws('iam', 'delete-user-policy', '--user-name', username, '--policy-name', 'AssetMasterFeatureRequestsOnly')
        aws('iam', 'delete-user', '--user-name', username)
        raise
    print('Dedicated SMTP identity configured; credentials saved only in ignored private configuration.')

if __name__ == '__main__':
    main()
