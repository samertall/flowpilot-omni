#!/usr/bin/env python3
"""Make a short, evidence-backed demo walkthrough only AFTER confirmed three-chain execution.

No video is produced from PENDING or simulated transactions. Uses local screenshots and
public tx receipts; does not require a wallet, secret, browser or laptop setup.
"""
import json, re, subprocess, tempfile, os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parent.parent
EVIDENCE=ROOT/'docs/CLOUD_EVIDENCE.json'
DEPLOYMENT=ROOT/'deployments/lasna.json'
OUTPUT=ROOT/'docs/flowpilot-verified-demo.mp4'
if not EVIDENCE.is_file() or not DEPLOYMENT.is_file():
    raise SystemExit('No cloud receipts found. Deploy and VERIFY REAL CALLBACK before generating video.')
e=json.loads(EVIDENCE.read_text())
d=json.loads(DEPLOYMENT.read_text())
if e.get('status')!='VERIFIED_THREE_CHAIN_PAYMENT_CALLBACK':
    raise SystemExit('Refusing to create a verification video from unverified or pending chain evidence.')
for ch in ['origin','reactive','callback']:
    h=e.get('transactions',{}).get(ch,{}).get('hash','')
    if not re.fullmatch(r'0x[0-9a-fA-F]{64}',h):raise SystemExit(f'Missing real {ch} transaction hash.')

W,H=1280,720
BG='#071319';SURFACE='#10252b';MINT='#91efda';WHITE='#eaf5f6';MUTED='#93b0b8';BLUE='#7eafff'
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
fontbold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def font(size,bold=False):return ImageFont.truetype(fontbold if bold else fontpath,size)

def draw_card(draw,x,y,w,h):draw.rounded_rectangle((x,y,x+w,y+h),radius=20,fill=SURFACE,outline='#235058',width=2)

def wrapped(draw,text,x,y,fill=WHITE,size=27,max_width=1110,lineheight=42):
    f=font(size)
    words=str(text).split(' ')
    lines=[];line=''
    for word in words:
        trial=(line+' '+word).strip()
        if draw.textbbox((0,0),trial,font=f)[2]>max_width and line:
            lines.append(line);line=word
        else:line=trial
    if line:lines.append(line)
    for l in lines:draw.text((x,y),l,font=f,fill=fill);y+=lineheight
    return y

def base(title,subtitle,kicker='REAL ON-CHAIN EXECUTION'):
    im=Image.new('RGB',(W,H),BG);d=ImageDraw.Draw(im)
    d.rounded_rectangle((55,47,1225,660),radius=26,fill='#0b1d23',outline='#1d3b45',width=2)
    d.text((95,75),'FLOWPILOT',font=font(26,True),fill=MINT)
    d.text((900,81),kicker,font=font(14,True),fill=MUTED)
    d.line((95,125,1185,125),fill='#1c434b',width=2)
    d.text((95,168),title,font=font(47,True),fill=WHITE)
    wrapped(d,subtitle,95,248,fill=MUTED,size=23)
    d.text((96,618),'Reactive Omni  •  Lasna  •  Base Sepolia  •  Unichain Sepolia',font=font(18),fill=MUTED)
    return im,d

def hash_card(draw,label,hash_,y,explorer):
    draw_card(draw,95,y,1085,120)
    draw.text((122,y+15),label.upper(),font=font(17,True),fill=MINT)
    draw.text((122,y+44),hash_,font=font(22),fill=WHITE)
    draw.text((122,y+83),explorer,font=font(17),fill=MUTED)

scenes=[]
# 1 - Explanation and genuine status
im,dra=base('Set it. Forget it. Done.','Conditional escrow payout with real event-driven Reactive Omni callbacks.')
dra.text((95,340),'VERIFIED REAL THREE-CHAIN EXECUTION',font=font(28,True),fill=MINT)
dra.text((95,392),'No keeper bot. No custodied source ETH. No token bridge.',font=font(24),fill=WHITE)
scenes.append(im)
# 2 - UI screenshot, transparently labeled as design reference
im,dra=base('No-code automation experience','Users define a rule, escrow demo fUSD, and trigger a Base Sepolia payment.')
shot=ROOT/'docs/preview-dashboard-desktop.png'
if shot.is_file():
    preview=Image.open(shot).convert('RGB')
    preview=preview.crop((0,0,preview.width,min(int(preview.width*.48),preview.height)))
    preview.thumbnail((660,290))
    im.paste(preview,(95,320))
dra=ImageDraw.Draw(im)
dra.text((815,370),'UI preview',font=font(28,True),fill=MINT)
wrapped(dra,'The recorded proof comes from independent explorer receipts, not this static preview.',815,414,size=20,max_width=295,lineheight=30)
scenes.append(im)
# 3 - Origin proof
im,dra=base('1  •  Origin event','A real qualifying testnet ETH payment emitted PaymentMade on Base Sepolia.')
hash_card(dra,'BASE SEPOLIA — PaymentMade',e['transactions']['origin']['hash'],335,'sepolia.basescan.org')
scenes.append(im)
# 4 - Reactive proof
im,dra=base('2  •  Autonomous reaction','The OmniRelay on Lasna observed the event and requested an authenticated callback.')
hash_card(dra,'LASNA OMNI — RelayRequested',e['transactions']['reactive']['hash'],335,'lasna-omni.reactscan.net')
scenes.append(im)
# 5 - Destination proof
im,dra=base('3  •  Destination payout','The Unichain Sepolia callback proxy delivered the call and escrowed demo fUSD was released.')
hash_card(dra,'UNICHAIN SEPOLIA — PayoutExecuted',e['transactions']['callback']['hash'],335,'sepolia.uniscan.xyz')
scenes.append(im)
# 6 - Addresses
im,dra=base('Contracts you can independently inspect','Public deployments across three testnets.')
for i,(chain,name,addr) in enumerate([
    ('Base Sepolia','PaymentGate',d['baseSepolia']['paymentGate']),
    ('Lasna Omni','OmniRelay',d['lasna']['omniRelay']),
    ('Unichain Sepolia','PayoutVault',d['unichainSepolia']['payoutVault'])]):
    y=322+i*88;draw_card(dra,95,y,1080,75)
    dra.text((120,y+12),chain,font=font(17,True),fill=MINT)
    dra.text((345,y+12),name,font=font(20),fill=WHITE)
    dra.text((345,y+41),addr,font=font(16),fill=MUTED)
scenes.append(im)
# 7 - Verified outcome
im,dra=base('Full loop completed on-chain','Origin, Lasna reaction and destination state checked against chain receipts.')
dra.text((95,340),'STATUS   VERIFIED',font=font(34,True),fill=MINT)
dra.text((95,402),f"Payout: {e['payoutFUSD']} DEMO fUSD",font=font(28),fill=WHITE)
dra.text((95,452),f"Source payment: {e['sourceAmountETH']} Base Sepolia test ETH",font=font(23),fill=WHITE)
scenes.append(im)
# 8 - Links and disclosure
im,dra=base('See the code. Verify the transactions.','Public source and open on-chain receipts for every stage.')
wrapped(dra,'github.com/samertall/flowpilot-omni',95,360,fill=MINT,size=28)
wrapped(dra,'Unaudited testnet prototype. fUSD is demonstration-only and has no monetary value.',95,435,fill=MUTED,size=22)
scenes.append(im)

with tempfile.TemporaryDirectory() as temp:
    p=Path(temp)
    concat=[]
    for i,img in enumerate(scenes):
        path=p/f'{i:02}.png';img.save(path)
        concat.extend([f"file '{path}'",'duration 9'])
    last_image=p/(f"{len(scenes)-1:02}.png")
    concat.append(f"file '{last_image}'")
    playlist=p/'images.txt';playlist.write_text('\n'.join(concat)+'\n')
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-safe','0','-f','concat','-i',str(playlist),'-r','15','-vf',f'scale={W}:{H}:flags=lanczos,format=yuv420p','-c:v','libx264','-preset','veryfast','-crf','28','-movflags','+faststart',str(OUTPUT)]
    subprocess.run(cmd,check=True)
print(f'Verified evidence walkthrough created: {OUTPUT} ({OUTPUT.stat().st_size} bytes), 72 seconds, no fabricated hashes.')
