This is my first pet project. OTC platform for trading between Massa and EVM network.

https://black-massa-otc.vercel.app <br/>
https://t.me/black_massa_otc

Frontend: 
React, NextJS, Massa API, Viem, Wagmi

Two smartcontracts in different blockchains:

Currently in test networks:
Massa.BUILDNET and Polygon Amoy <s>Mumbai</s>

1. Main logic in massa_otc_contract.ts for MASSA network       // TypeScript and Massa API
2. Ledger for Polygon(EVM) network polygon_otc_contract.sol    // Solidity
3. BOT on remote server to watch and manage deals between the networks and Telegram(telegraf) bot for notifications.  // TypeScript
