import base64
import subprocess

out = subprocess.run(
    ["openssl", "ec", "-in", "vapid_private.pem", "-text", "-noout"],
    capture_output=True, text=True
).stdout

def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

def parse_hex_block(text, label):
    start = text.index(label) + len(label)
    rest = text[start:]
    lines = []
    for line in rest.split("\n")[1:]:
        line = line.strip()
        if not line or ":" not in line and not all(c in "0123456789abcdef:" for c in line):
            break
        lines.append(line.rstrip(":"))
        if not line.endswith(":"):
            break
    hexstr = "".join(lines).replace(":", "")
    return bytes.fromhex(hexstr)

priv = parse_hex_block(out, "priv:")
pub = parse_hex_block(out, "pub:")

assert len(priv) == 32, len(priv)
assert len(pub) == 65 and pub[0] == 4, (len(pub), pub[0])

x = pub[1:33]
y = pub[33:65]

print("VAPID_PUBLIC_KEY (base64url, for client applicationServerKey & VAPID k param):")
print(b64url(pub))
print()
print("VAPID_PRIVATE_KEY_D (base64url, raw 32-byte scalar):")
print(b64url(priv))
print()
print("JWK private key (for importKey in the Worker):")
print('{"kty":"EC","crv":"P-256","d":"%s","x":"%s","y":"%s","ext":true}' % (b64url(priv), b64url(x), b64url(y)))
