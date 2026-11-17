// Happy Monk mascot — layered SVG Namaste motion rig using the custom mascot & logo artwork.
// Pivots (SVG user space 412x678): head 197,300 · shoulders 140,322 / 254,322 · elbows 118,396 / 276,396

const HALO = 'stroke="#fff" stroke-width="10.5" stroke-linejoin="round" stroke-linecap="round"';
const BOLD = 'stroke="#000" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round"';
const MED = 'stroke="#000" stroke-width="3.8" stroke-linejoin="round" stroke-linecap="round"';

export const monkSVG = `
<svg class="monk" viewBox="0 0 412 678" role="img" aria-label="The Happy Monk greeting you with a namaste" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="hm-head-clip">
      <path d="M40 20 H365 V238 L303 238 C296 266 276 286 246 299 C226 307 210 310 197 310 C184 310 168 307 148 299 C118 286 98 266 91 238 L40 238 Z" />
    </clipPath>
    <clipPath id="hm-body-clip">
      <path d="M0 296 L146 296 C168 306 184 309 197 309 C210 309 226 306 248 296 L412 296 V678 H0 Z" />
    </clipPath>
  </defs>

  <g class="m-body">
    <!-- Torso, legs, sandals & skyline -->
    <g class="m-torso">
      <ellipse cx="197" cy="304" rx="44" ry="14" fill="#fff" />
      <image href="/img/mascot-base.jpg" x="0" y="0" width="412" height="678" clip-path="url(#hm-body-clip)" />
    </g>

    <!-- Left Arm & Namaste Hand (at rotation 0 = exact Namaste pose) -->
    <g class="m-arm m-arm-l">
      <!-- Outer white halo + upper sleeve -->
      <path d="M145 308 C120 322 102 362 106 394 C108 408 118 412 132 409 L138 376 C138 358 142 342 148 326 Z" fill="#fff" ${HALO}/>
      <path d="M145 308 C120 322 102 362 106 394 C108 408 118 412 132 409 L138 376 C138 358 142 342 148 326 Z" fill="#fff" ${BOLD}/>
      <!-- Seamless shoulder blend -->
      <polygon points="145,311 151,311 151,354 132,354 138,322" fill="#fff" />
      <path d="M154 302 C152 315 151 326 152 336" fill="none" ${BOLD}/>
      <path d="M134 350 C135 366 136 376 146 378" fill="none" ${MED}/>

      <g class="m-fore m-fore-l">
        <!-- Forearm sleeve -->
        <path d="M110 392 C110 410 120 414 136 408 C156 402 174 394 186 386 L180 364 C162 370 146 376 132 378 Z" fill="#fff" ${BOLD}/>
        <!-- Elbow interior blend -->
        <circle cx="122" cy="392" r="13" fill="#fff" />
        <path d="M134 360 C135 370 136 376 146 378" fill="none" ${MED}/>
        <!-- Cuff line -->
        <line x1="174" y1="365" x2="180" y2="389" ${MED}/>
        <!-- Left Namaste hand -->
        <path d="M180 366 C178 354 184 332 194 322 C196 320 197 322 197 326 L197 384 C192 388 186 387 182 384 Z" fill="#fff" ${BOLD}/>
        <path d="M185 362 C189 350 192 348 195 354" fill="none" ${MED}/>
      </g>
    </g>

    <!-- Right Arm & Namaste Hand (at rotation 0 = exact Namaste pose) -->
    <g class="m-arm m-arm-r">
      <!-- Outer white halo + upper sleeve -->
      <path d="M249 308 C274 322 292 362 288 394 C286 408 276 412 262 409 L256 376 C256 358 252 342 246 326 Z" fill="#fff" ${HALO}/>
      <path d="M249 308 C274 322 292 362 288 394 C286 408 276 412 262 409 L256 376 C256 358 252 342 246 326 Z" fill="#fff" ${BOLD}/>
      <!-- Seamless shoulder blend -->
      <polygon points="249,311 243,311 243,354 262,354 256,322" fill="#fff" />
      <path d="M240 302 C242 315 243 326 242 336" fill="none" ${BOLD}/>
      <path d="M260 350 C259 366 258 376 248 378" fill="none" ${MED}/>

      <g class="m-fore m-fore-r">
        <!-- Forearm sleeve -->
        <path d="M284 392 C284 410 274 414 258 408 C238 402 220 394 208 386 L214 364 C232 370 248 376 262 378 Z" fill="#fff" ${BOLD}/>
        <!-- Elbow interior blend -->
        <circle cx="272" cy="392" r="13" fill="#fff" />
        <path d="M260 360 C259 370 258 376 248 378" fill="none" ${MED}/>
        <!-- Cuff line -->
        <line x1="220" y1="365" x2="214" y2="389" ${MED}/>
        <!-- Right Namaste hand -->
        <path d="M214 366 C216 354 210 332 200 322 C198 320 197 322 197 326 L197 384 C202 388 208 387 212 384 Z" fill="#fff" ${BOLD}/>
        <path d="M209 362 C205 350 202 348 199 354" fill="none" ${MED}/>
      </g>
    </g>

    <!-- Head (nods/bows for Namaste & tracks cursor) -->
    <g class="m-head">
      <image href="/img/mascot-base.jpg" x="0" y="0" width="412" height="678" clip-path="url(#hm-head-clip)" />
      <!-- Blinking eyelids -->
      <g class="m-eyes-open">
        <g class="m-eye" style="transform: scaleY(0); transform-origin: 158px 176px;">
          <rect x="136" y="166" width="44" height="22" rx="6" fill="#fff" />
          <path d="M140 177 Q158 183 176 177" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" />
        </g>
        <g class="m-eye" style="transform: scaleY(0); transform-origin: 236px 176px;">
          <rect x="214" y="166" width="44" height="22" rx="6" fill="#fff" />
          <path d="M218 177 Q236 183 254 177" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" />
        </g>
      </g>
      <!-- Happy smiling eyes during Namaste bow -->
      <g class="m-eyes-happy" opacity="0">
        <rect x="136" y="166" width="44" height="23" rx="6" fill="#fff" />
        <rect x="214" y="166" width="44" height="23" rx="6" fill="#fff" />
        <path d="M142 179 Q158 165 175 179" fill="none" stroke="#000" stroke-width="4.5" stroke-linecap="round" />
        <path d="M219 179 Q236 165 252 179" fill="none" stroke="#000" stroke-width="4.5" stroke-linecap="round" />
      </g>
    </g>
  </g>
</svg>`;

export const logoSVG = `
<svg class="logo-mark" viewBox="0 0 100 100" role="img" aria-label="Happy Monk logo" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#000"/>
  <image href="/img/logo.png" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet" />
</svg>`;
