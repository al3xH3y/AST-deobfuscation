# AST-deobfuscation
akami v2.0 deobfuscation


npm init -y

npm install estraverse && npm install escodegen

Launch script who will generate output : 

node deob.js obfuscated.json

node deob.js ../akamai-deobfuscator-2.0/ch38.json
[-] escodegen failed on full AST, trying a filtered approach...
[+] escodegen succeeded on filtered AST (kept top-level declarations).
[OK] Wrote generated source to /home/user/deobast/src.js

Get the obfuscated flag : 
node /home/alexis2/deobast/src.js
