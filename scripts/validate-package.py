#!/usr/bin/env python3
"""Offline project packaging checks. Not a substitute for forge build or a live callback."""
import json, re, shutil, subprocess
from datetime import datetime, timezone
from pathlib import Path
R = Path(__file__).resolve().parent.parent
required=['README.md','LICENSE','foundry.toml','package.json','src/PaymentGate.sol',
    'src/OmniRelay.sol','src/PayoutVault.sol','src/MockUSD.sol',
    'test/FlowPilot.t.sol','app/index.html','app/styles.css','app/app.js',
    'app/deployments.json','scripts/deploy.sh','scripts/fund.sh','scripts/verify-evidence.mjs',
    'docs/SUBMISSION.md','docs/VIDEO_SCRIPT.md','docs/LIVE_EXECUTION_CHECKLIST.md']
missing=[p for p in required if not (R/p).is_file()]
assert not missing, f'Missing project files: {missing}'
for p in ['app/deployments.json','package.json']:
    json.loads((R/p).read_text())
for p in ['scripts/deploy.sh','scripts/fund.sh','scripts/check-loop.sh']:
    subprocess.run(['bash','-n',str(R/p)],check=True)
for p in ['app/app.js','scripts/verify-evidence.mjs']:
    subprocess.run(['node','--check',str(R/p)],check=True)
assert not (R/'.env').exists(), 'A private .env must NOT be bundled'
assert not (R/'deployments/lasna.json').exists(), 'No on-chain deployments verified; unexpected addresses found'
ui_js=(R/'app/app.js').read_text()
assert 'hex: \'0x512577\'' in ui_js, 'Incorrect Lasna chain ID encoding'
assert 'hex: \'0x14a34\'' in ui_js, 'Incorrect Base Sepolia chain ID encoding'
assert 'hex: \'0x515\'' in ui_js, 'Incorrect Unichain Sepolia chain ID encoding'
assert 'TokenTransferFailed' in (R/'src/PayoutVault.sol').read_text(), 'Token transfer error name collision unresolved'
assert (R/'docs/preview-dashboard-desktop.png').is_file()
assert (R/'docs/preview-dashboard-mobile.png').is_file()
assert (R/'docs/flowpilot-intro-preview.mp4').is_file()
results={
  'checkedAt':datetime.now(timezone.utc).isoformat(),
  'status':'STATIC_VALIDATION_PASSED',
  'project':'FlowPilot — Reactive Omni Buildathon',
  'filePresencePass':True,'jsonPass':True,'bashSyntaxPass':True,'javaScriptSyntaxPass':True,
  'uiPreviewAvailable':True,'introPreviewVideoAvailable':True,
  'includedFilesChecked':len(required),'solidityTestFunctionsWritten':len(re.findall(r'function test\w+', (R/'test/FlowPilot.t.sol').read_text())),
  'forgeAvailable': bool(shutil.which('forge')),
  'foundryCompilationExecuted':False,
  'foundryTestsExecuted':False,
  'testnetDeploymentConfirmed':False,
  'originToCallbackLoopConfirmed':False,
  'githubRepoPublished':False,
  'doraHacksSubmitted':False,
  'note':'No live execution was observed. Do not mistake static validation or mock browser screenshots for on-chain proof.'
}
(R/'docs/LOCAL_VALIDATION.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
