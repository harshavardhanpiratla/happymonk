// Happy Monk character — layered SVG motion rig.
// Pivots (SVG user space): neck 200,238 · shoulders 140,265 / 260,265 · elbows 140,348 / 260,348

const S = 'stroke="#000" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"';
const W = 'stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';

export const headSVG = `
  <g class="m-head">
    <!-- ears -->
    <ellipse cx="131" cy="168" rx="17" ry="27" fill="#fff" ${S}/>
    <path d="M136 156 Q126 168 136 182" fill="none" ${S} stroke-width="2.5"/>
    <ellipse cx="269" cy="168" rx="17" ry="27" fill="#fff" ${S}/>
    <path d="M264 156 Q274 168 264 182" fill="none" ${S} stroke-width="2.5"/>
    <!-- face -->
    <path d="M134 150 C134 92 166 70 200 70 C236 70 266 92 266 150 C266 200 246 246 200 248 C154 246 134 200 134 150 Z" fill="#fff" ${S}/>
    <!-- hair, side-parted -->
    <path d="M136 146 C128 92 160 60 202 60 C246 60 274 92 264 146 C260 124 252 110 240 104 C214 112 182 110 156 102 C146 112 140 126 136 146 Z" fill="#000" ${W}/>
    <path d="M168 66 C182 84 210 96 238 100" fill="none" stroke="#fff" stroke-width="1.6" opacity=".7"/>
    <!-- brows -->
    <path d="M150 133 Q170 123 190 131" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round"/>
    <path d="M210 131 Q230 123 250 133" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round"/>
    <!-- eyes -->
    <g class="m-eyes-open">
      <ellipse class="m-eye" cx="171" cy="157" rx="4.5" ry="5" fill="#000"/>
      <ellipse class="m-eye" cx="229" cy="157" rx="4.5" ry="5" fill="#000"/>
    </g>
    <g class="m-eyes-happy" opacity="0">
      <path d="M162 160 Q171 150 180 160" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M220 160 Q229 150 238 160" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
    </g>
    <!-- glasses -->
    <rect x="145" y="140" width="51" height="35" rx="11" fill="none" stroke="#000" stroke-width="4.5"/>
    <rect x="204" y="140" width="51" height="35" rx="11" fill="none" stroke="#000" stroke-width="4.5"/>
    <path d="M196 153 Q200 149 204 153" fill="none" stroke="#000" stroke-width="4"/>
    <path d="M145 150 L134 154 M255 150 L266 154" stroke="#000" stroke-width="4"/>
    <!-- nose -->
    <path d="M199 166 Q192 186 198 193 Q205 196 211 191" fill="none" ${S} stroke-width="3"/>
    <!-- moustache -->
    <path d="M168 207 C174 194 192 195 200 201 C208 195 226 194 232 207 C236 215 240 219 245 221 C230 224 214 216 200 211 C186 216 170 224 155 221 C160 219 164 215 168 207 Z" fill="#000"/>
    <!-- mouth -->
    <path class="m-mouth" d="M187 225 Q200 228 213 225" fill="none" ${S} stroke-width="3"/>
    <path class="m-smile" d="M183 222 Q200 238 217 222" fill="none" ${S} stroke-width="3" opacity="0"/>
    <path d="M190 240 Q200 243 210 240" fill="none" ${S} stroke-width="2" opacity=".55"/>
  </g>`;

const arm = (side) => {
  const L = side === 'l';
  const x = L ? 140 : 260;
  const d = L ? -1 : 1;
  return `
  <g class="m-arm m-arm-${side}">
    <path d="M${x - 15} 300 C${x - 16} 270 ${x - 10} 253 ${x} 253 C${x + 10} 253 ${x + 16} 270 ${x + 14} 300 L${x + 13} 350 L${x - 13} 350 Z" fill="#fff" ${S}/>
    <path d="M${x + 6 * d} 290 Q${x + 2 * d} 318 ${x + 4 * d} 340" fill="none" ${S} stroke-width="1.8" opacity=".5"/>
    <g class="m-fore m-fore-${side}">
      <path d="M${x - 13} 350 C${x - 13} 336 ${x + 13} 336 ${x + 13} 350 L${x + 10} 408 L${x - 10} 408 Z" fill="#fff" ${S}/>
      <path d="M${x - 11} 398 L${x + 11} 398" ${S} stroke-width="2.5"/>
      <g class="m-hand">
        <path d="M${x - 10} 406 C${x - 13} 418 ${x - 11} 432 ${x - 4} 438 C${x + 2} 442 ${x + 9} 438 ${x + 11} 428 C${x + 12} 420 ${x + 11} 412 ${x + 10} 406 Z" fill="#fff" ${S}/>
        <path d="M${x + 10 * -d} 412 Q${x + 18 * -d} 418 ${x + 14 * -d} 426" fill="#fff" ${S} stroke-width="3"/>
        <path d="M${x - 4} 424 L${x - 4} 434 M${x + 2} 425 L${x + 2} 436" ${S} stroke-width="1.6" opacity=".55"/>
      </g>
    </g>
  </g>`;
};

export const monkSVG = `
<svg class="monk" viewBox="-30 0 460 640" role="img" aria-label="The Happy Monk — a moustached man in round glasses greeting you with a namaste" xmlns="http://www.w3.org/2000/svg">
  <g class="m-skyline" transform="translate(-30 0)" fill="none" stroke="#fff" stroke-width="1.4" opacity=".85">
    <path d="M20 600 L440 600"/>
    <path d="M30 600 V520 H62 V600 M38 530 H54 M38 545 H54 M38 560 H54 M38 575 H54"/>
    <path d="M70 600 V470 H98 V600 M76 482 H92 M76 497 H92 M76 512 H92 M76 527 H92 M76 542 H92"/>
    <path d="M330 600 V430 L350 404 V600 M336 445 H346 M336 462 H346 M336 479 H346 M336 496 H346 M336 513 H346"/>
    <path d="M356 600 V480 H384 V600 M362 492 H378 M362 508 H378 M362 524 H378 M362 540 H378"/>
    <path d="M390 600 V540 H420 V600 M396 552 H414 M396 566 H414 M396 580 H414"/>
    <path d="M350 404 V384"/>
  </g>
  <g class="m-body">
    <!-- legs -->
    <path d="M140 432 L199 432 L195 592 L160 592 Z" fill="#000" ${W}/>
    <path d="M201 432 L260 432 L240 592 L205 592 Z" fill="#000" ${W}/>
    <!-- sandals -->
    <path d="M150 600 C150 590 160 588 176 588 C192 588 202 590 202 600 C202 606 188 609 176 609 C162 609 150 606 150 600 Z" fill="#fff" ${S}/>
    <path d="M198 600 C198 590 208 588 224 588 C240 588 250 590 250 600 C250 606 238 609 224 609 C210 609 198 606 198 600 Z" fill="#fff" ${S}/>
    <path d="M164 592 Q176 600 188 592 M212 592 Q224 600 236 592" fill="none" ${S} stroke-width="3"/>
    <!-- neck -->
    <path d="M182 226 L182 256 L218 256 L218 226" fill="#fff" ${S}/>
    <!-- shirt -->
    <g class="m-torso">
      <path d="M140 262 C150 250 172 246 184 246 L216 246 C228 246 250 250 260 262 L268 300 L262 432 L138 432 L132 300 Z" fill="#fff" ${S}/>
      <path d="M184 246 L200 274 L216 246" fill="none" ${S}/>
      <path d="M184 246 L176 272 L197 268 Z M216 246 L224 272 L203 268 Z" fill="#fff" ${S}/>
      <path d="M200 274 V430" ${S} stroke-width="2.5"/>
      <g fill="#000"><circle cx="205" cy="295" r="2.6"/><circle cx="205" cy="325" r="2.6"/><circle cx="205" cy="355" r="2.6"/><circle cx="205" cy="385" r="2.6"/><circle cx="205" cy="415" r="2.6"/></g>
      <path d="M220 300 H246 V322 Q233 327 220 322 Z" fill="none" ${S} stroke-width="2.5"/>
      <path d="M150 380 Q160 400 156 425 M250 380 Q240 400 244 425" fill="none" ${S} stroke-width="1.6" opacity=".45"/>
      <rect x="138" y="426" width="124" height="10" fill="#000" ${W} stroke-width="2"/>
    </g>
    ${headSVG.replace('class="m-head"', 'class="m-head"')}
    ${arm('l')}
    ${arm('r')}
  </g>
</svg>`;

export const logoSVG = `
<svg class="logo-mark" viewBox="0 0 100 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#000"/>
  <circle cx="50" cy="50" r="44" fill="none" stroke="#fff" stroke-width="2.5"/>
  <circle cx="50" cy="50" r="38" fill="none" stroke="#fff" stroke-width="1"/>
  <g transform="translate(50 54) scale(.2) translate(-200 -158)">
    ${headSVG.replace('class="m-head"', 'class="logo-head"').replace(/<g class="m-eyes-happy"[\s\S]*?<\/g>/, '').replace(/<path class="m-smile"[^>]*\/>/, '')}
  </g>
</svg>`;
