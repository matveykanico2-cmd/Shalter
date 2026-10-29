var v=`
<svg viewBox="0 0 100 100" class="ch ch-fox" aria-hidden="true">
  <g class="ch-tail-g">
    <path class="ch-tail" d="M40 74c-14 4-26-2-30-14-3-10 2-20 10-24-3 12 2 22 12 26 4 2 8 6 8 12z" fill="#e2703a"/>
    <path d="M14 40c-4 6-4 14 1 19 3 3 7 5 11 5-6-6-9-15-8-24z" fill="#fff3e6"/>
  </g>
  <g class="ch-body-g">
    <ellipse cx="52" cy="70" rx="24" ry="20" fill="#f08a4b"/>
    <ellipse cx="52" cy="76" rx="14" ry="12" fill="#fff3e6"/>
    <g class="ch-arm-g">
      <rect class="ch-arm" x="70" y="56" width="9" height="22" rx="4.5" fill="#e2703a"/>
    </g>
    <g class="ch-head-g">
      <path d="M32 34l6-16 12 9z" fill="#e2703a"/>
      <path d="M72 34l-6-16-12 9z" fill="#e2703a"/>
      <path d="M36 33l3-8 6 5z" fill="#3a2a22"/>
      <path d="M68 33l-3-8-6 5z" fill="#3a2a22"/>
      <ellipse cx="52" cy="40" rx="24" ry="21" fill="#f08a4b"/>
      <path d="M52 48c-9 0-16 4-16 9 0 6 7 10 16 10s16-4 16-10c0-5-7-9-16-9z" fill="#fff3e6"/>
      <ellipse class="ch-eye" cx="43" cy="38" rx="3.6" ry="4.4" fill="#3a2a22"/>
      <ellipse class="ch-eye" cx="61" cy="38" rx="3.6" ry="4.4" fill="#3a2a22"/>
      <ellipse cx="52" cy="52" rx="4" ry="3" fill="#3a2a22"/>
      <path class="ch-mouth" d="M46 58q6 6 12 0" stroke="#3a2a22" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>
  </g>
</svg>`,_=`
<svg viewBox="0 0 100 100" class="ch ch-cat" aria-hidden="true">
  <g class="ch-tail-g">
    <path class="ch-tail" d="M62 78c12 4 22 0 26-10 3-8 0-17-6-21 3 9 1 17-6 21-5 3-11 5-14 10z" fill="#8b93a7"/>
  </g>
  <g class="ch-body-g">
    <ellipse cx="50" cy="72" rx="22" ry="18" fill="#9aa2b6"/>
    <ellipse cx="50" cy="78" rx="12" ry="10" fill="#e8ebf2"/>
    <g class="ch-arm-g">
      <rect class="ch-arm" x="24" y="58" width="9" height="20" rx="4.5" fill="#8b93a7"/>
    </g>
    <g class="ch-head-g">
      <path d="M30 30l2-14 13 9z" fill="#9aa2b6"/>
      <path d="M70 30l-2-14-13 9z" fill="#9aa2b6"/>
      <path d="M34 29l1-7 6 4z" fill="#f2a9bd"/>
      <path d="M66 29l-1-7-6 4z" fill="#f2a9bd"/>
      <ellipse cx="50" cy="40" rx="23" ry="20" fill="#9aa2b6"/>
      <ellipse class="ch-eye" cx="41" cy="38" rx="4" ry="5" fill="#2f3545"/>
      <ellipse class="ch-eye" cx="59" cy="38" rx="4" ry="5" fill="#2f3545"/>
      <path d="M50 48l-4 3h8z" fill="#f2a9bd"/>
      <path class="ch-mouth" d="M44 54q6 5 12 0" stroke="#2f3545" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M22 44h12M22 48h12M66 44h12M66 48h12" stroke="#e8ebf2" stroke-width="1.6" stroke-linecap="round"/>
    </g>
  </g>
</svg>`,$=`
<svg viewBox="0 0 100 100" class="ch ch-ghost" aria-hidden="true">
  <g class="ch-float-g">
    <path d="M50 12c-16 0-27 12-27 28v34c0 4 4 6 7 3l5-5 6 6c2 2 5 2 7 0l5-5 5 5c2 2 5 2 7 0l6-6 5 5c3 3 7 1 7-3V40c0-16-11-28-27-28z" fill="#f2f4fb"/>
    <ellipse class="ch-eye" cx="41" cy="38" rx="4.2" ry="5.2" fill="#2b3040"/>
    <ellipse class="ch-eye" cx="59" cy="38" rx="4.2" ry="5.2" fill="#2b3040"/>
    <ellipse class="ch-mouth-o" cx="50" cy="52" rx="6" ry="7" fill="#2b3040"/>
    <g class="ch-arm-g">
      <ellipse class="ch-arm" cx="80" cy="44" rx="7" ry="9" fill="#f2f4fb"/>
    </g>
    <ellipse cx="20" cy="46" rx="7" ry="9" fill="#f2f4fb"/>
    <ellipse cx="36" cy="48" rx="4" ry="2.6" fill="#ffd0dd" opacity="0.75"/>
    <ellipse cx="64" cy="48" rx="4" ry="2.6" fill="#ffd0dd" opacity="0.75"/>
  </g>
</svg>`,B=`
<svg viewBox="0 0 100 100" class="ch ch-robot" aria-hidden="true">
  <g class="ch-body-g">
    <line x1="50" y1="18" x2="50" y2="9" stroke="#8b93a7" stroke-width="2.5"/>
    <circle class="ch-blink-dot" cx="50" cy="7" r="4" fill="#4ade80"/>
    <rect x="26" y="18" width="48" height="38" rx="12" fill="#5b8def"/>
    <rect x="34" y="30" width="32" height="14" rx="7" fill="#12182a"/>
    <circle class="ch-eye-dot" cx="43" cy="37" r="3.4" fill="#7ee0ff"/>
    <circle class="ch-eye-dot" cx="57" cy="37" r="3.4" fill="#7ee0ff"/>
    <rect x="32" y="58" width="36" height="26" rx="8" fill="#4a7ade"/>
    <rect x="42" y="66" width="16" height="10" rx="3" fill="#12182a"/>
    <g class="ch-arm-g">
      <rect class="ch-arm" x="72" y="58" width="8" height="20" rx="4" fill="#5b8def"/>
    </g>
    <rect x="20" y="58" width="8" height="20" rx="4" fill="#5b8def"/>
  </g>
</svg>`,O=`
<svg viewBox="0 0 100 100" class="ch ch-penguin" aria-hidden="true">
  <g class="ch-body-g">
    <ellipse cx="50" cy="58" rx="26" ry="32" fill="#2f3545"/>
    <ellipse cx="50" cy="64" rx="17" ry="24" fill="#f7f9ff"/>
    <g class="ch-arm-g">
      <ellipse class="ch-arm" cx="78" cy="56" rx="7" ry="15" fill="#2f3545"/>
    </g>
    <ellipse cx="22" cy="56" rx="7" ry="15" fill="#2f3545"/>
    <ellipse class="ch-eye" cx="42" cy="42" rx="3.6" ry="4.4" fill="#12182a"/>
    <ellipse class="ch-eye" cx="58" cy="42" rx="3.6" ry="4.4" fill="#12182a"/>
    <path d="M50 48l-6 5h12z" fill="#f5a623"/>
    <path d="M38 88l-6 5h14z" fill="#f5a623"/>
    <path d="M62 88l6 5h-14z" fill="#f5a623"/>
  </g>
</svg>`,T=`
<svg viewBox="0 0 100 100" class="ch ch-crab" aria-hidden="true">
  <g class="ch-walk-g">
    <g class="ch-claw-g">
      <path class="ch-claw" d="M24 58c-7 0-12-4-13-9-1-4 1-8 5-9 2 5 1 10 5 11 2 2 4 3 5 3z" fill="#e63946"/>
      <ellipse class="ch-claw-eye" cx="16" cy="52" rx="1.8" ry="2.4" fill="#1d3557"/>
    </g>
    <g class="ch-leg1">
      <rect x="20" y="76" width="5" height="14" rx="2.5" fill="#e63946" transform="rotate(-12 22.5 83)"/>
    </g>
    <g class="ch-leg2">
      <rect x="38" y="78" width="5" height="14" rx="2.5" fill="#e63946" transform="rotate(8 40.5 85)"/>
    </g>
    <g class="ch-leg3">
      <rect x="56" y="77" width="5" height="14" rx="2.5" fill="#e63946" transform="rotate(12 58.5 84)"/>
    </g>
    <g class="ch-leg4">
      <rect x="74" y="76" width="5" height="14" rx="2.5" fill="#e63946" transform="rotate(-12 76.5 83)"/>
    </g>
    <g class="ch-claw-right-g">
      <path class="ch-claw" d="M76 58c7 0 12-4 13-9 1-4-1-8-5-9-2 5-1 10-5 11-2 2-4 3-5 3z" fill="#e63946"/>
      <ellipse class="ch-claw-eye" cx="84" cy="52" rx="1.8" ry="2.4" fill="#1d3557"/>
    </g>
    <g class="ch-body-g">
      <ellipse cx="50" cy="64" rx="22" ry="18" fill="#e63946"/>
      <ellipse cx="50" cy="68" rx="12" ry="11" fill="#fff3f0"/>
      <g class="ch-eyestalk-g">
        <path d="M42 58c-3 0-5-2-5-5s2-5 5-5 5 2 5 5-2 5-5 5z" fill="#e63946"/>
        <circle class="ch-eye" cx="42" cy="53" r="2.2" fill="#1d3557"/>
      </g>
      <g class="ch-eyestalk-g-right">
        <path d="M58 58c3 0 5-2 5-5s-2-5-5-5-5 2-5 5 2 5 5 5z" fill="#e63946"/>
        <circle class="ch-eye" cx="58" cy="53" r="2.2" fill="#1d3557"/>
      </g>
      <path class="ch-mouth" d="M42 72q8 6 16 0" stroke="#1d3557" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </g>
  </g>
</svg>`,p={fox:{markup:v,name:"\u041B\u0438\u0441"},cat:{markup:_,name:"\u041A\u043E\u0442"},ghost:{markup:$,name:"\u041F\u0440\u0438\u0437\u0440\u0430\u043A"},robot:{markup:B,name:"\u0420\u043E\u0431\u043E\u0442"},penguin:{markup:O,name:"\u041F\u0438\u043D\u0433\u0432\u0438\u043D"},crab:{markup:T,name:"\u041A\u0440\u0430\u0431"}},E={"\u{1F98A}":"fox","\u{1F431}":"cat","\u{1F408}":"cat","\u{1F63A}":"cat","\u{1F47B}":"ghost","\u{1F916}":"robot","\u{1F427}":"penguin","\u{1F980}":"crab"};function y(e,l){return l&&p[l]?l:E[e]??null}function g(e,{size:l=84}={}){let a=p[e];if(!a)return null;let s=document.createElement("div");return s.className=`char-scene char-${e}`,s.style.width=`${l}px`,s.style.height=`${l}px`,s.innerHTML=a.markup,s}var i=(e,l,a,s=3.4)=>`
  <g class="g-eyes">
    <ellipse class="g-eye" cx="${e}" cy="${a}" rx="${s}" ry="${s*1.25}" fill="#2f2a24"/>
    <ellipse class="g-eye" cx="${l}" cy="${a}" rx="${s}" ry="${s*1.25}" fill="#2f2a24"/>
    <circle cx="${e+1.2}" cy="${a-1.4}" r="${s*.34}" fill="#fff"/>
    <circle cx="${l+1.2}" cy="${a-1.4}" r="${s*.34}" fill="#fff"/>
  </g>`,n=(e,l,a)=>`
  <ellipse cx="${e}" cy="${a}" rx="4.6" ry="3" fill="#ff9d9d" opacity="0.55"/>
  <ellipse cx="${l}" cy="${a}" rx="4.6" ry="3" fill="#ff9d9d" opacity="0.55"/>`,R=`
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <g class="g-steam">
    <path class="g-steam-1" d="M42 34c-4-5 3-8-1-13" stroke="#cfd6e4" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path class="g-steam-2" d="M52 32c-4-6 3-9-1-14" stroke="#cfd6e4" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path class="g-steam-3" d="M62 35c-3-5 2-8-1-12" stroke="#cfd6e4" stroke-width="2.8" fill="none" stroke-linecap="round"/>
  </g>
  <g class="g-hop">
    <path d="M74 52c7 0 12 4 12 10s-5 11-13 11l-3-6c5 0 9-2 9-5s-3-4-7-4z" fill="#e8e2da"/>
    <path d="M24 44h50v20c0 12-9 20-25 20s-25-8-25-20z" fill="#f6f2ec"/>
    <path class="g-liquid" d="M28 47h42v6c0 3-9 5-21 5s-21-2-21-5z" fill="#6f4326"/>
    <path d="M28 47h42v3c0 2-9 4-21 4s-21-2-21-4z" fill="#8a5733" opacity="0.85"/>
    ${i(41,59,64)}
    ${n(33,67,71)}
    <path class="g-smile" d="M43 72q7 6 14 0" stroke="#2f2a24" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <rect x="20" y="86" width="60" height="6" rx="3" fill="#d8d1c6"/>
  </g>
</svg>`,A=`
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <g class="g-sparks">
    <circle class="g-spark g-spark-1" cx="22" cy="70" r="3" fill="#ffe9a8"/>
    <circle class="g-spark g-spark-2" cx="78" cy="72" r="2.6" fill="#fff3c9"/>
    <circle class="g-spark g-spark-3" cx="50" cy="86" r="2.2" fill="#ffdf8a"/>
  </g>
  <g class="g-hop g-hop-high">
    <g class="g-spin-soft">
      <path d="M50 10l11 24 26 3-19 18 5 26-23-13-23 13 5-26-19-18 26-3z" fill="#ffffff" stroke="#ffd66b" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M50 18l8 18 20 2-14 13 3 19-17-9-17 9 3-19-14-13 20-2z" fill="#fffdf5"/>
      ${i(43,57,46,3.1)}
      ${n(36,64,53)}
      <path class="g-smile" d="M45 54q5 5 10 0" stroke="#2f2a24" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    </g>
  </g>
</svg>`,C=`
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <defs>
    <clipPath id="g-diamond-clip"><path d="M50 88L12 44l14-20h48l14 20z"/></clipPath>
  </defs>
  <g class="g-hop">
    <path d="M50 88L12 44l14-20h48l14 20z" fill="#63c7f5"/>
    <path d="M26 24h48l14 20H12z" fill="#a5e2fb"/>
    <path d="M50 88L12 44h76z" fill="#3fa9e0" opacity="0.9"/>
    <path d="M38 44l12 44 12-44-12-20z" fill="#8ad8fa"/>
    <path d="M26 24l12 20 12-20z" fill="#d3f1ff" opacity="0.9"/>
    <path d="M62 24l12 20-24 0z" fill="#c2ecff" opacity="0.75"/>
    <g clip-path="url(#g-diamond-clip)">
      <rect class="g-shine" x="-40" y="10" width="26" height="90" fill="#ffffff" opacity="0.55" transform="skewX(-18)"/>
    </g>
    ${i(42,58,52,3)}
    <path class="g-smile" d="M44 60q6 5 12 0" stroke="#1d5b7a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </g>
  <path class="g-twinkle g-twinkle-1" d="M18 26l2.4 6 6 2.4-6 2.4-2.4 6-2.4-6-6-2.4 6-2.4z" fill="#ffffff"/>
  <path class="g-twinkle g-twinkle-2" d="M84 60l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#eaf9ff"/>
</svg>`,q=`
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <defs>
    <clipPath id="g-cup-clip"><path d="M30 20h40v22c0 12-9 20-20 20s-20-8-20-20z"/></clipPath>
  </defs>
  <g class="g-confetti">
    <rect class="g-conf g-conf-1" x="20" y="18" width="5" height="8" rx="1.5" fill="#ff6b81"/>
    <rect class="g-conf g-conf-2" x="74" y="14" width="5" height="8" rx="1.5" fill="#5bc8ff"/>
    <rect class="g-conf g-conf-3" x="52" y="10" width="5" height="8" rx="1.5" fill="#9b7cff"/>
  </g>
  <g class="g-hop">
    <path d="M30 20h40v22c0 12-9 20-20 20s-20-8-20-20z" fill="#f5c542"/>
    <path d="M36 24h28v18c0 9-6 15-14 15s-14-6-14-15z" fill="#ffd96b"/>
    <path d="M30 24h-9c0 12 4 18 12 20l-2-6c-4-2-5-6-5-14z" fill="#e5b132"/>
    <path d="M70 24h9c0 12-4 18-12 20l2-6c4-2 5-6 5-14z" fill="#e5b132"/>
    <g clip-path="url(#g-cup-clip)">
      <rect class="g-shine" x="-40" y="0" width="20" height="70" fill="#fff8dd" opacity="0.75" transform="skewX(-16)"/>
    </g>
    ${i(43,57,36,3)}
    <path class="g-smile" d="M44 44q6 5 12 0" stroke="#7a5a12" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <rect x="44" y="62" width="12" height="12" fill="#e5b132"/>
    <rect x="32" y="74" width="36" height="8" rx="3" fill="#d9a52c"/>
    <rect x="26" y="82" width="48" height="9" rx="4" fill="#c9962a"/>
  </g>
</svg>`,L=`
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <g class="g-breathe">
    <path id="g-inf-path" d="M50 50c-8-13-16-19-25-19-11 0-19 8-19 19s8 19 19 19c9 0 17-6 25-19 8-13 16-19 25-19 11 0 19 8 19 19s-8 19-19 19c-9 0-17-6-25-19z"
      fill="none" stroke="#8f7bff" stroke-width="11" stroke-linecap="round"/>
    <path d="M50 50c-8-13-16-19-25-19-11 0-19 8-19 19s8 19 19 19c9 0 17-6 25-19 8-13 16-19 25-19 11 0 19 8 19 19s-8 19-19 19c-9 0-17-6-25-19z"
      fill="none" stroke="#c3b6ff" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
  </g>
  <circle class="g-runner" r="5.5" fill="#fff6b0">
    <animateMotion dur="3.4s" repeatCount="indefinite" rotate="auto">
      <mpath href="#g-inf-path"/>
    </animateMotion>
  </circle>
</svg>`,F=`
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <g class="g-sway">
    <g>
      <ellipse cx="50" cy="26" rx="13" ry="16" fill="#ffc2d8"/>
      <ellipse cx="72" cy="42" rx="13" ry="16" fill="#ffb5cf" transform="rotate(72 72 42)"/>
      <ellipse cx="64" cy="68" rx="13" ry="16" fill="#ffc2d8" transform="rotate(144 64 68)"/>
      <ellipse cx="36" cy="68" rx="13" ry="16" fill="#ffb5cf" transform="rotate(216 36 68)"/>
      <ellipse cx="28" cy="42" rx="13" ry="16" fill="#ffc2d8" transform="rotate(288 28 42)"/>
      <circle cx="50" cy="50" r="9" fill="#fff0b3"/>
      <circle cx="50" cy="50" r="4.5" fill="#ffd75e"/>
      ${i(44,56,49,2.6)}
      <path class="g-smile" d="M46 55q4 4 8 0" stroke="#8a5a6a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    </g>
  </g>
  <ellipse class="g-petal g-petal-1" cx="24" cy="30" rx="6" ry="8" fill="#ffd3e2"/>
  <ellipse class="g-petal g-petal-2" cx="78" cy="24" rx="5" ry="7" fill="#ffc2d8"/>
  <ellipse class="g-petal g-petal-3" cx="60" cy="20" rx="4.5" ry="6" fill="#ffe0ea"/>
</svg>`,I=`
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <path class="g-luck" d="M50 6l2.6 7 7 2.6-7 2.6-2.6 7-2.6-7-7-2.6 7-2.6z" fill="#ffe9a8"/>
  <g class="g-hop">
    <path d="M50 56c1 12 4 22 10 30-8-3-14-11-16-22z" fill="#3f9e5a"/>
    <g transform="translate(50 50)">
      <g transform="rotate(-45)"><g class="g-leaf g-leaf-1"><path d="M0 0C-9-5-21-10-21-19-21-26-14-30-8-27-4-25-1-21 0-18 1-21 4-25 8-27 14-30 21-26 21-19 21-10 9-5 0 0Z" fill="#57c46f"/></g></g>
      <g transform="rotate(45)"><g class="g-leaf g-leaf-2"><path d="M0 0C-9-5-21-10-21-19-21-26-14-30-8-27-4-25-1-21 0-18 1-21 4-25 8-27 14-30 21-26 21-19 21-10 9-5 0 0Z" fill="#4bb865"/></g></g>
      <g transform="rotate(135)"><g class="g-leaf g-leaf-3"><path d="M0 0C-9-5-21-10-21-19-21-26-14-30-8-27-4-25-1-21 0-18 1-21 4-25 8-27 14-30 21-26 21-19 21-10 9-5 0 0Z" fill="#54c06b"/></g></g>
      <g transform="rotate(225)"><g class="g-leaf g-leaf-4"><path d="M0 0C-9-5-21-10-21-19-21-26-14-30-8-27-4-25-1-21 0-18 1-21 4-25 8-27 14-30 21-26 21-19 21-10 9-5 0 0Z" fill="#49b160"/></g></g>
      <circle r="4.5" fill="#2f8f4b"/>
    </g>
    <g class="g-eyes">
      <ellipse class="g-eye" cx="44" cy="46" rx="2.7" ry="3.4" fill="#2f2a24"/>
      <ellipse class="g-eye" cx="56" cy="46" rx="2.7" ry="3.4" fill="#2f2a24"/>
      <circle cx="45" cy="45" r="0.9" fill="#fff"/>
      <circle cx="57" cy="45" r="0.9" fill="#fff"/>
    </g>
    <path class="g-smile" d="M45 54q5 4 10 0" stroke="#1f6b38" stroke-width="2" fill="none" stroke-linecap="round"/>
  </g>
</svg>`,S=`
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <g class="g-stem-sway">
    <path d="M50 54c-2 14-2 26 0 38" stroke="#3f9e5a" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path class="g-leaf g-leaf-1" d="M50 70c-11 1-19-5-21-15 11-3 19 4 21 15z" fill="#57c46f"/>
    <path class="g-leaf g-leaf-2" d="M50 80c11 1 19-5 21-15-11-3-19 4-21 15z" fill="#4bb865"/>
    <g class="g-nod">
      <path d="M50 14c-4 0-8 4-10 10-2-6-6-10-10-10-5 0-8 5-8 12v12c0 13 12 20 28 20s28-7 28-20V26c0-7-3-12-8-12-4 0-8 4-10 10-2-6-6-10-10-10z" fill="#f2557a"/>
      <path d="M40 24c-2-6-6-10-10-10-5 0-8 5-8 12v12c0 8 5 14 13 17-3-9-4-20 5-31z" fill="#ff7d9a"/>
      <path d="M60 24c2-6 6-10 10-10 5 0 8 5 8 12v12c0 8-5 14-13 17 3-9 4-20-5-31z" fill="#e04a6c"/>
      <g class="g-eyes">
        <ellipse class="g-eye" cx="44" cy="40" rx="2.7" ry="3.4" fill="#2f2a24"/>
        <ellipse class="g-eye" cx="56" cy="40" rx="2.7" ry="3.4" fill="#2f2a24"/>
        <circle cx="45" cy="39" r="0.9" fill="#fff"/>
        <circle cx="57" cy="39" r="0.9" fill="#fff"/>
      </g>
      <path class="g-smile" d="M45 47q5 4 10 0" stroke="#7a2740" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>
  </g>
</svg>`,N=`
<svg viewBox="0 0 100 100" class="art g-art" aria-hidden="true">
  <path d="M50 58c-1 12-1 22 0 32" stroke="#3f9e5a" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path class="g-leaf g-leaf-1" d="M50 74c-11 1-19-4-22-14 11-3 19 3 22 14z" fill="#57c46f"/>
  <g class="g-turn">
    <g class="g-petals-shiver">
      <g fill="#ffc93c">
        <ellipse cx="50" cy="16" rx="7" ry="13"/>
        <ellipse cx="74" cy="26" rx="7" ry="13" transform="rotate(45 74 26)"/>
        <ellipse cx="84" cy="48" rx="7" ry="13" transform="rotate(90 84 48)"/>
        <ellipse cx="74" cy="70" rx="7" ry="13" transform="rotate(135 74 70)"/>
        <ellipse cx="50" cy="80" rx="7" ry="13"/>
        <ellipse cx="26" cy="70" rx="7" ry="13" transform="rotate(45 26 70)"/>
        <ellipse cx="16" cy="48" rx="7" ry="13" transform="rotate(90 16 48)"/>
        <ellipse cx="26" cy="26" rx="7" ry="13" transform="rotate(135 26 26)"/>
      </g>
    </g>
    <circle cx="50" cy="48" r="19" fill="#7a4a1e"/>
    <circle cx="50" cy="48" r="14" fill="#8f5a26"/>
    ${i(44,56,45,3)}
    ${n(37,63,52)}
    <path class="g-smile" d="M44 54q6 5 12 0" stroke="#2f1c08" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </g>
</svg>`,x={coffee:{markup:R,name:"\u041A\u043E\u0444\u0435"},star:{markup:A,name:"\u0417\u0432\u0435\u0437\u0434\u0430"},diamond:{markup:C,name:"\u0410\u043B\u043C\u0430\u0437"},trophy:{markup:q,name:"\u041A\u0443\u0431\u043E\u043A"},infinity:{markup:L,name:"\u0411\u0435\u0441\u043A\u043E\u043D\u0435\u0447\u043D\u043E\u0441\u0442\u044C"},sakura:{markup:F,name:"\u0421\u0430\u043A\u0443\u0440\u0430"},clover:{markup:I,name:"\u041A\u043B\u0435\u0432\u0435\u0440"},tulip:{markup:S,name:"\u0422\u044E\u043B\u044C\u043F\u0430\u043D"},sunflower:{markup:N,name:"\u041F\u043E\u0434\u0441\u043E\u043B\u043D\u0443\u0445"}},m={"\u2615":"coffee","\u2B50":"star","\u{1F31F}":"star","\u{1F4AB}":"star","\u{1F48E}":"diamond","\u{1F3C6}":"trophy","\u267E\uFE0F":"infinity","\u{1F338}":"sakura","\u{1F340}":"clover","\u2618\uFE0F":"clover","\u{1F337}":"tulip","\u{1F33B}":"sunflower"};var H=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="ch-body-g">
    <ellipse cx="48" cy="62" rx="30" ry="28" fill="#ffd36e"/>
    <ellipse cx="48" cy="68" rx="19" ry="17" fill="#fff1c9"/>
    <ellipse class="ch-eye" cx="38" cy="52" rx="4" ry="5" fill="#4a3a1e"/>
    <ellipse class="ch-eye" cx="58" cy="52" rx="4" ry="5" fill="#4a3a1e"/>
    <ellipse cx="30" cy="62" rx="5" ry="3.4" fill="#ffb3a7" opacity="0.85"/>
    <ellipse cx="66" cy="62" rx="5" ry="3.4" fill="#ffb3a7" opacity="0.85"/>
    <path class="ch-mouth" d="M40 64q8 8 16 0" stroke="#4a3a1e" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <g class="ch-arm-g">
      <ellipse class="ch-arm" cx="82" cy="44" rx="8" ry="11" fill="#ffc94d"/>
    </g>
    <ellipse cx="16" cy="66" rx="7" ry="10" fill="#ffc94d"/>
  </g>
  <text class="art-word" x="50" y="20" text-anchor="middle" font-size="15" font-weight="700" fill="#ff8a3d">\u041F\u0440\u0438\u0432\u0435\u0442!</text>
</svg>`,P=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-beat">
    <path d="M50 84C24 66 12 52 12 38 12 26 21 18 32 18c7 0 13 3 18 9 5-6 11-9 18-9 11 0 20 8 20 20 0 14-12 28-38 46z" fill="#ff4d6d"/>
    <path d="M32 26c-6 0-11 5-11 12 0 3 1 6 3 9 1-9 5-15 12-19-1-1-3-2-4-2z" fill="#ff8095" opacity="0.9"/>
  </g>
  <path class="art-rise-1" d="M22 52c-6-5-9-8-9-12 0-3 2-5 5-5 2 0 3 1 4 2 1-1 2-2 4-2 3 0 5 2 5 5 0 4-3 7-9 12z" fill="#ff87a0"/>
  <path class="art-rise-2" d="M84 46c-5-4-8-7-8-10 0-3 2-4 4-4 2 0 3 1 4 2 1-1 2-2 4-2 2 0 4 1 4 4 0 3-3 6-8 10z" fill="#ffa8bb"/>
  <path class="art-twinkle-1" d="M20 24l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#ffd9e2"/>
  <ellipse cx="38" cy="36" rx="7" ry="4" fill="#ffffff" opacity="0.45" transform="rotate(-25 38 36)"/>
</svg>`,G=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-bow">
    <path d="M50 84c-14 0-24-9-24-22 0-9 4-18 9-26 2-3 6-3 7 1l6 20 6-20c1-4 5-4 7-1 5 8 9 17 9 26 0 13-10 22-24 22z" fill="#ffd7b0"/>
    <path d="M50 84c-8 0-14-5-17-12 4 3 10 5 17 5s13-2 17-5c-3 7-9 12-17 12z" fill="#f5bd8f"/>
    <path d="M50 57l-5-17c-1-4 4-6 6-2l4 9 4-9c2-4 7-2 6 2z" fill="#ffe3c8"/>
  </g>
  <path class="art-twinkle-1" d="M24 26l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#ffd166"/>
  <path class="art-twinkle-2" d="M76 20l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#ffe9a8"/>
</svg>`,D=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-shake">
    <rect x="24" y="46" width="52" height="40" rx="6" fill="#7c5cf0"/>
    <rect x="44" y="46" width="12" height="40" fill="#ffd166"/>
    <rect x="20" y="38" width="60" height="14" rx="5" fill="#9b7cff"/>
    <rect x="44" y="38" width="12" height="14" fill="#ffd166"/>
  </g>
  <g class="art-lid">
    <rect x="20" y="30" width="60" height="13" rx="5" fill="#b39bff"/>
    <path d="M50 30c-6-8-16-10-18-4-2 5 6 8 18 4zm0 0c6-8 16-10 18-4 2 5-6 8-18 4z" fill="#ffd166"/>
  </g>
  <circle class="art-confetti-1" cx="30" cy="30" r="4" fill="#ff6b9a"/>
  <circle class="art-confetti-2" cx="70" cy="26" r="3.4" fill="#4dd4c0"/>
  <rect class="art-confetti-3" x="48" y="16" width="6" height="6" rx="1.5" fill="#ffd166"/>
</svg>`,J=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-jump">
    <circle cx="50" cy="52" r="32" fill="#ffd36e"/>
    <path d="M28 44q8-8 16 0" stroke="#4a3a1e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M56 44q8-8 16 0" stroke="#4a3a1e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M30 60q20 22 40 0z" fill="#4a3a1e"/>
    <path d="M38 72q12 8 24 0z" fill="#ff7a8a"/>
  </g>
  <path class="art-tear-1" d="M22 50c3 5 4 8 2 10-2 2-5 0-5-3 0-2 1-4 3-7z" fill="#7ec8ff"/>
  <path class="art-tear-2" d="M78 50c3 5 4 8 2 10-2 2-5 0-5-3 0-2 1-4 3-7z" fill="#7ec8ff"/>
</svg>`,U=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-sway">
    <circle cx="50" cy="52" r="32" fill="#a9c4fb"/>
    <ellipse class="ch-eye" cx="38" cy="46" rx="4" ry="5" fill="#2b3a55"/>
    <ellipse class="ch-eye" cx="62" cy="46" rx="4" ry="5" fill="#2b3a55"/>
    <path d="M36 70q14-12 28 0" stroke="#2b3a55" stroke-width="3" fill="none" stroke-linecap="round"/>
  </g>
  <path class="art-tear-1" d="M36 54c4 7 6 11 3 14-3 3-8 0-8-4 0-3 2-6 5-10z" fill="#4aa8ff"/>
</svg>`,Z=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-breathe">
    <circle cx="46" cy="56" r="30" fill="#ffd36e"/>
    <path d="M26 46q8 6 16 0" stroke="#4a3a1e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M52 46q8 6 16 0" stroke="#4a3a1e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="46" cy="66" rx="6" ry="4" fill="#4a3a1e"/>
    <path d="M18 40c6-16 22-26 40-22 6 1 8 6 3 9L26 48c-5 3-10-1-8-8z" fill="#7c5cf0"/>
    <circle cx="60" cy="20" r="6" fill="#ffd166"/>
  </g>
  <text class="art-z-1" x="76" y="34" font-size="16" font-weight="700" fill="#9b7cff">Z</text>
  <text class="art-z-2" x="86" y="22" font-size="12" font-weight="700" fill="#b39bff">z</text>
</svg>`,V=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-pop">
    <path d="M38 44c0-6 6-8 8-14 2-5 1-12 5-14 6-3 11 3 11 10 0 4-2 8-3 11h13c6 0 10 4 9 9l-5 26c-1 5-5 8-10 8H45c-4 0-7-3-7-7z" fill="#ffd36e"/>
    <rect x="18" y="46" width="18" height="34" rx="5" fill="#ffc94d"/>
    <path d="M46 58h26" stroke="#e8a93a" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M46 68h26" stroke="#e8a93a" stroke-width="2.4" stroke-linecap="round"/>
  </g>
  <path class="art-twinkle-1" d="M74 22l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#ffe9a8"/>
  <path class="art-twinkle-2" d="M24 26l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#ffd166"/>
</svg>`,X=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <path d="M48 44c0 18 1 30 2 42" stroke="#2f9e5e" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path class="art-leaf" d="M49 64c-14-1-22-8-23-18 12-1 21 6 23 18z" fill="#37b36a"/>
  <path class="art-leaf-2" d="M51 76c13-1 20-7 21-16-11-1-19 5-21 16z" fill="#2a8b53"/>
  <g class="art-sway">
    <path d="M50 46c-14 0-23-9-23-20 0-12 10-20 23-20s23 8 23 20c0 11-9 20-23 20z" fill="#c9203a"/>
    <path d="M50 42c-11 0-18-7-18-15 0-6 4-11 10-13-3 4-4 8-3 13 2 8 8 12 17 12-2 2-4 3-6 3z" fill="#e63950"/>
    <path d="M52 38c-8 1-14-3-15-10-1-6 2-11 8-13-2 4-2 8 0 12 3 6 8 9 15 8-2 2-5 3-8 3z" fill="#ff5c74"/>
    <path d="M52 30c-4 1-7-1-8-5-1-3 1-6 4-7-1 2-1 4 0 6 2 3 5 4 8 3-1 2-2 3-4 3z" fill="#ff94a6"/>
  </g>
</svg>`,Y=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="ch-body-g">
    <circle cx="28" cy="30" r="11" fill="#b07a4f"/>
    <circle cx="72" cy="30" r="11" fill="#b07a4f"/>
    <circle cx="28" cy="30" r="5" fill="#e0b28a"/>
    <circle cx="72" cy="30" r="5" fill="#e0b28a"/>
    <ellipse cx="50" cy="70" rx="26" ry="22" fill="#c08a5c"/>
    <ellipse cx="50" cy="74" rx="15" ry="14" fill="#e8c49c"/>
    <g class="ch-arm-g"><ellipse class="ch-arm" cx="80" cy="62" rx="9" ry="12" fill="#b07a4f"/></g>
    <ellipse cx="20" cy="62" rx="9" ry="12" fill="#b07a4f"/>
    <g class="ch-head-g">
      <circle cx="50" cy="38" r="24" fill="#c08a5c"/>
      <ellipse cx="50" cy="46" rx="13" ry="10" fill="#e8c49c"/>
      <ellipse class="ch-eye" cx="41" cy="34" rx="3.4" ry="4.2" fill="#4a3020"/>
      <ellipse class="ch-eye" cx="59" cy="34" rx="3.4" ry="4.2" fill="#4a3020"/>
      <ellipse cx="50" cy="43" rx="4.6" ry="3.4" fill="#4a3020"/>
      <path class="ch-mouth" d="M44 50q6 5 12 0" stroke="#4a3020" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>
  </g>
</svg>`,K=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-tilt">
    <ellipse cx="50" cy="66" rx="22" ry="24" fill="none" stroke="#f0c14b" stroke-width="9"/>
    <ellipse cx="50" cy="66" rx="22" ry="24" fill="none" stroke="#ffe08a" stroke-width="3"/>
    <path d="M50 12l15 15-15 17-15-17z" fill="#7ecbff"/>
    <path d="M50 12l15 15-15 5-15-5z" fill="#cdeeff"/>
    <path d="M35 27l15-5 15 5-15 17z" fill="#a5dcff" opacity="0.75"/>
  </g>
  <path class="art-twinkle-1" d="M76 20l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#ffffff"/>
  <path class="art-twinkle-2" d="M24 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff0b8"/>
</svg>`,W=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-breathe">
    <rect x="20" y="56" width="60" height="28" rx="6" fill="#ffd9e8"/>
    <rect x="20" y="48" width="60" height="14" rx="6" fill="#fff2f7"/>
    <path d="M20 56q10 8 20 0t20 0 20 0v6H20z" fill="#ff8fb1"/>
    <rect x="47" y="30" width="6" height="18" rx="2" fill="#7c5cf0"/>
  </g>
  <path class="art-flame" d="M50 20c4 4 6 7 6 10a6 6 0 0 1-12 0c0-3 2-6 6-10z" fill="#ffb03a"/>
  <path class="art-flame-2" d="M50 24c2 2 3 4 3 6a3 3 0 0 1-6 0c0-2 1-4 3-6z" fill="#ffe58f"/>
</svg>`,j=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-float">
    <path d="M18 66L12 30l20 14 18-24 18 24 20-14-6 36z" fill="#f4c542"/>
    <rect x="18" y="66" width="64" height="12" rx="4" fill="#e0ac2b"/>
    <circle cx="50" cy="52" r="5" fill="#ff5c74"/>
    <circle cx="30" cy="56" r="4" fill="#4dd4c0"/>
    <circle cx="70" cy="56" r="4" fill="#7c9dff"/>
  </g>
  <path class="art-twinkle-1" d="M80 26l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fff3c4"/>
</svg>`,Q=`
<svg viewBox="0 0 100 100" class="art" aria-hidden="true">
  <g class="art-shake">
    <rect x="22" y="48" width="56" height="40" rx="6" fill="#4dc3ff"/>
    <rect x="44" y="48" width="12" height="40" fill="#fff0a8"/>
    <rect x="18" y="40" width="64" height="14" rx="5" fill="#6ed0ff"/>
    <rect x="44" y="40" width="12" height="14" fill="#fff0a8"/>
  </g>
  <g class="art-lid">
    <path d="M50 34c-7-9-18-11-20-5-2 6 7 9 20 5zm0 0c7-9 18-11 20-5 2 6-7 9-20 5z" fill="#ffd166"/>
  </g>
  <path class="art-twinkle-1" d="M24 26l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fff3c4"/>
</svg>`,u={...x,hello:{markup:H,name:"\u041F\u0440\u0438\u0432\u0435\u0442"},love:{markup:P,name:"\u041B\u044E\u0431\u043E\u0432\u044C"},thanks:{markup:G,name:"\u0421\u043F\u0430\u0441\u0438\u0431\u043E"},congrats:{markup:D,name:"\u041F\u043E\u0437\u0434\u0440\u0430\u0432\u043B\u044F\u044E"},laugh:{markup:J,name:"\u0421\u043C\u0435\u0445"},sad:{markup:U,name:"\u0413\u0440\u0443\u0441\u0442\u044C"},sleep:{markup:Z,name:"\u0421\u043E\u043D"},cool:{markup:V,name:"\u041A\u043B\u0430\u0441\u0441"},rose:{markup:X,name:"\u0420\u043E\u0437\u0430"},teddy:{markup:Y,name:"\u041C\u0438\u0448\u043A\u0430"},ring:{markup:K,name:"\u041A\u043E\u043B\u044C\u0446\u043E"},cake:{markup:W,name:"\u0422\u043E\u0440\u0442"},crown:{markup:j,name:"\u041A\u043E\u0440\u043E\u043D\u0430"},giftbox:{markup:Q,name:"\u041F\u043E\u0434\u0430\u0440\u043E\u043A"}},ll={...m,"\u{1F44B}":"hello","\u2764\uFE0F":"love","\u{1F496}":"love","\u{1F64F}":"thanks","\u{1F389}":"congrats","\u{1F973}":"congrats","\u{1F602}":"laugh","\u{1F923}":"laugh","\u{1F622}":"sad","\u{1F62D}":"sad","\u{1F634}":"sleep","\u{1F44D}":"cool","\u{1F339}":"rose","\u{1F9F8}":"teddy","\u{1F48D}":"ring","\u{1F382}":"cake","\u{1F451}":"crown","\u{1F381}":"giftbox"};function k(e,l){return l&&u[l]?l:ll[e]??null}function w(e,{size:l=84}={}){let a=u[e];if(!a)return null;let s=document.createElement("div");return s.className=`char-scene art-${e}`,s.style.width=`${l}px`,s.style.height=`${l}px`,s.innerHTML=a.markup,s}var o={bear_honey:{parts:[{anim:"wave",dur:1.6},{e:"\u{1F36F}",anim:"rise",delay:1.1,x:34,y:22,size:.42,dur:2.1},{e:"\u{1F944}",anim:"dip",delay:1.9,x:40,y:4,size:.36,dur:1.4}],loop:3.6},rock_blink:{parts:[{anim:"settle",dur:3.2},{e:"\u{1F440}",anim:"blink",delay:1.2,x:0,y:-6,size:.3,dur:2}],loop:3.2},cat_yarn:{parts:[{anim:"wiggle",dur:1.4},{e:"\u{1F9F6}",anim:"roll",delay:.8,x:-36,y:24,size:.4,dur:2.4}],loop:3.2},coffee_steam:{parts:[{anim:"settle",dur:3},{e:"\u{1F4A8}",anim:"steam",delay:.2,x:12,y:-30,size:.34,dur:2.2},{e:"\u{1F4A8}",anim:"steam",delay:1.1,x:-8,y:-34,size:.26,dur:2.2}],loop:3},cake_candle:{parts:[{anim:"settle",dur:3},{e:"\u2728",anim:"twinkle",delay:.3,x:-30,y:-26,size:.3,dur:1.6},{e:"\u2728",anim:"twinkle",delay:1,x:30,y:-20,size:.24,dur:1.6}],loop:3},rocket_launch:{parts:[{anim:"launch",dur:2.6},{e:"\u{1F4A8}",anim:"steam",delay:.9,x:-18,y:30,size:.3,dur:1.8}],loop:2.8},heart_beat:{parts:[{anim:"beat",dur:1.1},{e:"\u{1F497}",anim:"rise",delay:.7,x:30,y:10,size:.32,dur:2}],loop:2.8},party_pop:{parts:[{anim:"tada",dur:1.4},{e:"\u{1F38A}",anim:"burst",delay:.5,x:-34,y:-14,size:.34,dur:1.8},{e:"\u2728",anim:"burst",delay:.9,x:34,y:-20,size:.3,dur:1.8}],loop:2.8},crown_shine:{parts:[{anim:"float",dur:2.6},{e:"\u2728",anim:"twinkle",delay:.4,x:32,y:-18,size:.28,dur:1.6},{e:"\u2728",anim:"twinkle",delay:1.3,x:-30,y:-10,size:.22,dur:1.6}],loop:2.8},sleep_z:{parts:[{anim:"breathe",dur:2.8},{e:"\u{1F4A4}",anim:"rise",delay:.6,x:32,y:-14,size:.34,dur:2.4}],loop:3.2},fire_burn:{parts:[{anim:"flicker",dur:.9},{e:"\u2728",anim:"rise",delay:.5,x:22,y:6,size:.24,dur:1.6}],loop:2.2},money_rain:{parts:[{anim:"wiggle",dur:1.6},{e:"\u{1F4B8}",anim:"fall",delay:.6,x:-30,y:-30,size:.34,dur:2.2},{e:"\u{1F4B8}",anim:"fall",delay:1.4,x:28,y:-34,size:.28,dur:2.2}],loop:3.2},gift_open:{parts:[{anim:"shake-hard",dur:1.6},{e:"\u{1F380}",anim:"lid",delay:0,y:-30,size:.4,dur:1.6},{e:"\u2728",anim:"emerge",delay:0,y:-6,size:.5,dur:1.6},{e:"\u{1F31F}",anim:"burst",delay:1.05,x:34,y:-26,size:.3,dur:1},{e:"\u{1F31F}",anim:"burst",delay:1.2,x:-32,y:-18,size:.26,dur:1}],loop:2.6},wave_hi:{parts:[{anim:"wave",dur:1.5},{e:"Hi!",anim:"hi",delay:.35,x:30,y:-34,size:.34,dur:2.4}],loop:2.6},gasp_open:{parts:[{anim:"gasp",dur:1.8},{e:"\u2757",anim:"hi",delay:.8,x:32,y:-30,size:.3,dur:1.8}],loop:2.2},flame_live:{parts:[{anim:"burn",dur:1.1},{e:"\u2728",anim:"ember",delay:.2,x:10,y:-10,size:.24,dur:1.8},{e:"\u2728",anim:"ember",delay:.9,x:-14,y:-6,size:.2,dur:1.8}],loop:2.2},laugh_tears:{parts:[{anim:"jump",dur:1.5},{e:"\u{1F4A7}",anim:"tears",delay:.5,x:-26,y:-8,size:.24,dur:1.6},{e:"\u{1F4A7}",anim:"tears",delay:.9,x:26,y:-8,size:.24,dur:1.6}],loop:2.4},cry_river:{parts:[{anim:"settle",dur:2.4},{e:"\u{1F4A6}",anim:"tears",delay:.2,x:-22,y:0,size:.3,dur:1.6},{e:"\u{1F4A6}",anim:"tears",delay:.8,x:22,y:0,size:.3,dur:1.6}],loop:2.4},thumbs_pop:{parts:[{anim:"pop",dur:1.4},{e:"\u2728",anim:"burst",delay:.9,x:30,y:-24,size:.3,dur:1}],loop:2},clap_hands:{parts:[{anim:"pop",dur:1},{e:"\u2728",anim:"burst",delay:.6,x:-28,y:-22,size:.26,dur:.9},{e:"\u2728",anim:"burst",delay:.75,x:28,y:-22,size:.26,dur:.9}],loop:1.8},music_notes:{parts:[{anim:"swing",dur:1.8},{e:"\u{1F3B5}",anim:"notes",delay:.2,x:26,y:-10,size:.3,dur:2.6},{e:"\u{1F3B6}",anim:"notes",delay:1.2,x:-22,y:-6,size:.28,dur:2.6}],loop:3.2},snow_fall:{parts:[{anim:"breathe",dur:3},{e:"\u2744\uFE0F",anim:"drift",delay:0,x:-30,y:0,size:.24,dur:3.4},{e:"\u2744\uFE0F",anim:"drift",delay:1.2,x:26,y:0,size:.2,dur:3.4},{e:"\u2744\uFE0F",anim:"drift",delay:2.2,x:4,y:0,size:.18,dur:3.4}],loop:3.6},storm_flash:{parts:[{anim:"settle",dur:1.5},{e:"\u26A1",anim:"flash",delay:0,x:0,y:0,size:.9,dur:1.5}],loop:2.2},boom:{parts:[{anim:"shake-hard",dur:1.6},{e:"\u{1F4A5}",anim:"flash",delay:.9,x:0,y:-10,size:1,dur:1.5}],loop:2.6},rose_bloom:{parts:[{anim:"bloom",dur:2.8},{e:"\u2728",anim:"twinkle",delay:.9,x:28,y:-22,size:.26,dur:1.8}],loop:3},ring_shine:{parts:[{anim:"spin",dur:3.4},{e:"\u2728",anim:"twinkle",delay:.4,x:26,y:-24,size:.3,dur:1.6},{e:"\u{1F4AB}",anim:"twinkle",delay:1.4,x:-26,y:18,size:.26,dur:1.6}],loop:3.4},champagne_pop:{parts:[{anim:"shake-hard",dur:1.6},{e:"\u{1F942}",anim:"emerge",delay:0,x:26,y:10,size:.44,dur:1.6},{e:"\u{1F38A}",anim:"burst",delay:1.1,x:-24,y:-26,size:.3,dur:1}],loop:2.6},crab_dance:{parts:[{anim:"wave",dur:1.8},{e:"\u{1F980}",anim:"bounce",delay:.8,x:-24,y:-10,size:.32,dur:2.4},{e:"\u{1F30A}",anim:"drift",delay:1.2,x:32,y:-14,size:.34,dur:2.2},{e:"\u2728",anim:"twinkle",delay:.9,x:-30,y:-6,size:.24,dur:1.6},{e:"\u2728",anim:"twinkle",delay:1.7,x:28,y:-18,size:.2,dur:1.4}],loop:3.2},crab_birthday:{parts:[{anim:"breathe",dur:2.6},{e:"\u{1F980}",anim:"jump",delay:.6,x:0,y:-12,size:.34,dur:2.2},{e:"\u{1F382}",anim:"twinkle",delay:.9,x:22,y:-8,size:.3,dur:1.8},{e:"\u{1F389}",anim:"burst",delay:1.3,x:-26,y:-10,size:.28,dur:1.4},{e:"\u{1F388}",anim:"rise",delay:1,x:0,y:18,size:.32,dur:2.4}],loop:3.2},crab_hug:{parts:[{anim:"beat",dur:1.3},{e:"\u{1F980}",anim:"pulse",delay:.3,x:0,y:0,size:.36,dur:2},{e:"\u2764\uFE0F",anim:"rise",delay:.6,x:24,y:6,size:.28,dur:1.8}],loop:2.4}},b=["wave","wiggle","beat","float","tada","swing","flicker","breathe","settle"],el={"\u{1F43B}":"bear_honey","\u{1F36F}":"bear_honey","\u{1F5FF}":"rock_blink","\u{1FAA8}":"rock_blink","\u{1F431}":"cat_yarn","\u{1F408}":"cat_yarn","\u{1F63A}":"cat_yarn","\u2615":"coffee_steam","\u{1F375}":"coffee_steam","\u{1F382}":"cake_candle","\u{1F370}":"cake_candle","\u{1F680}":"rocket_launch","\u2764\uFE0F":"heart_beat","\u{1F496}":"heart_beat","\u{1F60D}":"heart_beat","\u{1F618}":"heart_beat","\u{1F973}":"party_pop","\u{1F389}":"party_pop","\u{1F38A}":"party_pop","\u{1F451}":"crown_shine","\u{1F48E}":"crown_shine","\u{1F31F}":"crown_shine","\u{1F4A0}":"crown_shine","\u{1F634}":"sleep_z","\u{1F971}":"sleep_z","\u{1F4B0}":"money_rain","\u{1F4B5}":"money_rain","\u{1F911}":"money_rain","\u{1F381}":"gift_open","\u{1F380}":"gift_open","\u{1F4E6}":"gift_open","\u{1F44B}":"wave_hi","\u{1F91A}":"wave_hi","\u{1F590}\uFE0F":"wave_hi","\u{1F62E}":"gasp_open","\u{1F632}":"gasp_open","\u{1F62F}":"gasp_open","\u{1F92F}":"gasp_open","\u{1F631}":"gasp_open","\u{1F525}":"flame_live","\u{1F56F}\uFE0F":"flame_live","\u{1F602}":"laugh_tears","\u{1F923}":"laugh_tears","\u{1F639}":"laugh_tears","\u{1F62D}":"cry_river","\u{1F622}":"cry_river","\u{1F44D}":"thumbs_pop","\u{1F64C}":"thumbs_pop","\u{1F44F}":"clap_hands","\u{1F3B5}":"music_notes","\u{1F3B6}":"music_notes","\u{1F3A7}":"music_notes","\u{1F3B8}":"music_notes","\u2744\uFE0F":"snow_fall","\u2603\uFE0F":"snow_fall","\u26C4":"snow_fall","\u26A1":"storm_flash","\u{1F329}\uFE0F":"storm_flash","\u{1F4A5}":"boom","\u{1F4A3}":"boom","\u{1F339}":"rose_bloom","\u{1F338}":"rose_bloom","\u{1F33A}":"rose_bloom","\u{1F337}":"rose_bloom","\u{1F48D}":"ring_shine","\u{1F490}":"rose_bloom","\u{1F37E}":"champagne_pop","\u{1F942}":"champagne_pop","\u{1F377}":"champagne_pop","\u{1F980}":"crab_dance"};function al(e){let l=0;for(let a of String(e??""))l=l*31+a.codePointAt(0)>>>0;return b[l%b.length]}function sl(e,l){if(l&&o[l])return o[l];let a=el[e];return a&&o[a]?o[a]:{parts:[{anim:al(e)}],loop:0}}function nl(e,{size:l=84,preferred:a,replay:s=!0}={}){let d=k(e,a);if(d){let r=w(d,{size:l});if(r)return r.classList.add(s?"anim-scene-entrance":"no-entrance"),r}let h=y(e,a);if(h){let r=g(h,{size:l});if(r)return s?r.classList.add("anim-scene-entrance"):r.classList.add("no-entrance"),r}let z=sl(e,a),t=document.createElement("div");return t.className=`anim-scene ${s?"":"no-entrance"}`,t.style.width=`${l}px`,t.style.height=`${l}px`,t.style.fontSize=`${l}px`,z.parts.forEach((r,M)=>{let f=document.createElement("span");f.className=`scene-part scene-${r.anim}`,f.textContent=r.e??e;let c=f.style;M>0&&(c.position="absolute",c.left="50%",c.top="50%",c.fontSize=`${Math.round(l*(r.size??.4))}px`,c.setProperty("--x",`${r.x??0}%`),c.setProperty("--y",`${r.y??0}%`),c.marginLeft=`${(r.x??0)/100*l}px`,c.marginTop=`${(r.y??0)/100*l}px`,c.transform="translate(-50%, -50%)"),r.delay&&(c.animationDelay=`${r.delay}s`),r.dur&&(c.animationDuration=`${r.dur}s`),t.appendChild(f)}),t}export{o as a,sl as b,nl as c};
