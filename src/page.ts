// The page the browser shows after sign-in. It copies the look of the pages Uncola's own services show
// (for example "You're connected" in Uncola for Slack): the grey bar with the logo, the sunburst
// background, the gradient title, the card with orange corners, the round check badge and the footer.

const LOGO = `<svg width="40" height="40" version="1.1" viewBox="0 0 77.333336 77.333336" xmlns="http://www.w3.org/2000/svg"> <g transform="matrix(1.3333333,0,0,1.3333333,0,1.6e-6)"> <g transform="translate(-401.88403,10.914475)"> <path d="m 448.36435,14.25988 c -0.0679,0.324134 -0.11685,0.652037 -0.21109,0.968635 -0.245,0.821639 -0.69727,1.530209 -1.30032,2.129477 -2.90229,2.890824 -5.79697,5.781641 -8.72181,8.649847 -1.06286,1.040241 -2.38586,1.458601 -3.86334,1.292765 -2.17105,-0.244988 -3.84451,-1.756355 -4.2742,-3.900908 -0.32791,-1.63952 0.0829,-3.120729 1.25134,-4.319273 1.65091,-1.696043 3.3508,-3.346866 5.0318,-5.012761 0.0566,-0.05653 0.12442,-0.101762 0.19977,-0.162065 -0.0754,-0.07915 -0.12439,-0.135685 -0.17712,-0.184679 -1.76395,-1.752585 -3.52793,-3.505171 -5.2919,-5.2577527 -0.82166,-0.8178725 -1.3079,-1.8015776 -1.43979,-2.9473543 -0.27136,-2.3367775 1.17596,-4.54163996 3.43368,-5.22759688 0.33167,-0.10176294 0.68598,-0.16583583 1.02899,-0.1997568 0.34299,-0.03392095 0.73496,-0.003769 0.7764,-0.003769 1.18729,0.0904552 2.20871,0.54650364 3.05301,1.37945178 2.96253,2.9322775 5.92127,5.8720945 8.8725,8.8156799 0.6521,0.648268 1.15716,1.40207 1.42105,2.29532 0.0942,0.316595 0.14322,0.644498 0.21103,0.968631 0,0.237448 0,0.474893 0,0.716109 z" style="fill:#E67E22;fill-opacity:1"></path> </g> <g transform="translate(11.372681,-210.79657)"> <path d="m 11.923808,243.92726 c 0.101768,0.0792 0.162073,0.11688 0.211069,0.16585 1.767725,1.75635 3.53545,3.51645 5.30317,5.2766 0.791516,0.78771 1.281502,1.73373 1.417191,2.84187 0.195997,1.5603 -0.248758,2.9322 -1.349346,4.06671 -1.070435,1.10052 -2.393401,1.57922 -3.916128,1.46609 -1.1722,-0.0866 -2.193635,-0.56155 -3.026611,-1.3945 -2.943691,-2.92849 -5.8798458,-5.86079 -8.819769,-8.79304 -0.7349806,-0.73497 -1.28904289,-1.58675 -1.52649809,-2.61195 -0.33545272,-1.45856 0.0188457,-2.76642 0.90836089,-3.94614 0.1809183,-0.2412 0.3844515,-0.46358 0.5992918,-0.67464 2.8042347,-2.80035 5.6122372,-5.59695 8.4202384-8.39352 1.077971,-1.07418 2.382092-1.54906 3.889743-1.45108 2.171022,0.13945 4.066894,1.86189 4.421191,4.01774 0.275149,1.68853 -0.188453,3.15465 -1.398347,4.3683 -1.632034,1.63573 -3.271607,3.26392 -4.907408,4.89589 -0.05654,0.0453 -0.12438,0.0867 -0.226148,0.16582 z" style="fill:#E67E22;fill-opacity:1"></path> </g> </g> </svg>`;

const STYLE = `
:root{--orange:#E67E22;--orange-light:#F39C12;--grey-darkest:#2C3E50;--grey-dark:#566573;--grey-medium:#85929E;--grey-light:#D5DBDB;--grey-lighter:#ECF0F1;--grey-lightest:#F8F9FA;--gold:#D4AF37}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Montserrat,sans-serif;background:var(--grey-lightest);color:var(--grey-darkest);overflow-x:hidden;display:flex;flex-direction:column;min-height:100vh}
body::before{content:'';position:fixed;inset:0;opacity:.5;pointer-events:none;z-index:0;
background:repeating-linear-gradient(0deg,transparent,transparent 100px,var(--grey-lighter) 100px,var(--grey-lighter) 101px),repeating-linear-gradient(90deg,transparent,transparent 100px,var(--grey-lighter) 100px,var(--grey-lighter) 101px)}
nav{background:#E0E0E0;padding:.5rem 1.5rem;min-height:64px;display:flex;align-items:center;position:relative;z-index:100;border-bottom:1px solid var(--grey-lighter)}
nav::after{content:'';position:absolute;bottom:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--orange),var(--gold),var(--orange))}
.logo{display:flex;align-items:center;gap:6px;text-decoration:none}
.logo-icon{width:48px;height:48px}.logo-icon svg{width:100%;height:100%;transition:transform .6s cubic-bezier(.34,1.56,.64,1)}
.logo:hover .logo-icon svg{transform:rotate(360deg) scale(1.1)}
.logo-text{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:600;color:var(--grey-darkest);letter-spacing:.5px}
main{position:relative;z-index:1;flex:1;display:flex;align-items:center;justify-content:center;padding:3rem 2rem;overflow:hidden;background:linear-gradient(135deg,#fff 0%,var(--grey-lightest) 100%)}
main::before{content:'';position:absolute;top:50%;left:50%;width:1200px;height:1200px;transform:translate(-50%,-50%);opacity:.3;z-index:-1;
background:repeating-conic-gradient(from 0deg,transparent 0deg,transparent 8deg,var(--grey-lighter) 8deg,var(--grey-lighter) 10deg);animation:sunburst 60s linear infinite}
@keyframes sunburst{to{transform:translate(-50%,-50%) rotate(360deg)}}
.content{text-align:center;max-width:520px;width:100%}
.title{font-family:'Playfair Display',serif;font-size:clamp(2rem,5vw,2.75rem);font-weight:900;line-height:1.1;letter-spacing:-1px;position:relative;margin-bottom:2.25rem}
.title::before,.title::after{content:'';position:absolute;left:50%;transform:translateX(-50%);width:80px;height:3px;background:linear-gradient(90deg,transparent,var(--orange),transparent)}
.title::before{top:-14px}.title::after{bottom:-14px}
.title-main{background:linear-gradient(135deg,var(--orange) 0%,var(--orange-light) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.card{position:relative;background:#fff;border:1px solid var(--grey-lighter);padding:2.25rem 2rem;box-shadow:0 16px 48px rgba(230,126,34,.08)}
.card::before,.card::after{content:'';position:absolute;width:32px;height:32px;border:1px solid var(--orange);pointer-events:none}
.card::before{top:-1px;left:-1px;border-right:none;border-bottom:none}.card::after{bottom:-1px;right:-1px;border-left:none;border-top:none}
.badge{width:72px;height:72px;margin:0 auto 1.25rem;border-radius:50%;display:flex;align-items:center;justify-content:center;
background:linear-gradient(135deg,var(--orange) 0%,var(--orange-light) 100%);box-shadow:0 8px 24px rgba(230,126,34,.3)}
.badge svg{width:36px;height:36px;fill:#fff}
h1{font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;text-transform:uppercase;letter-spacing:2px;position:relative;margin-bottom:1.5rem}
h1::after{content:'';position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);width:50px;height:2px;background:linear-gradient(90deg,transparent,var(--orange),transparent)}
p{font-size:.9375rem;line-height:1.6;color:var(--grey-dark)}p b{color:var(--grey-darkest)}
.btn{display:inline-block;margin-top:1.75rem;padding:.75rem 2rem;color:var(--grey-darkest);font-weight:700;font-size:.875rem;text-decoration:none;text-transform:uppercase;letter-spacing:2px;
border:2px solid var(--orange);clip-path:polygon(10% 0%,100% 0%,90% 100%,0% 100%);position:relative;overflow:hidden;transition:all .3s ease}
.btn::before{content:'';position:absolute;inset:0;left:-100%;background:linear-gradient(135deg,var(--orange) 0%,var(--orange-light) 100%);transition:left .3s ease;z-index:-1}
.btn:hover{color:#fff;box-shadow:0 4px 12px rgba(230,126,34,.4)}.btn:hover::before{left:0}
footer{background:var(--grey-lightest);padding:1.5rem 2rem 1rem;text-align:center;position:relative;z-index:1;border-top:5px solid transparent;
border-image:linear-gradient(90deg,transparent 0%,var(--orange) 25%,var(--gold) 50%,var(--orange) 75%,transparent 100%) 1}
.footer-links{display:flex;justify-content:center;gap:2rem;margin-bottom:.75rem}
.footer-links a{color:var(--grey-dark);text-decoration:none;font-size:.9375rem;font-weight:600;letter-spacing:1px;padding:.5rem 0;position:relative;transition:color .3s ease}
.footer-links a::after{content:'';position:absolute;bottom:0;left:0;width:0;height:2px;background:var(--orange);transition:width .3s ease}
.footer-links a:hover{color:var(--orange)}.footer-links a:hover::after{width:100%}
.footer-copy{color:var(--grey-medium);font-size:.875rem;letter-spacing:.5px;display:inline-block;padding-top:1.5rem;position:relative}
.footer-copy::before{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:100px;height:2px;background:linear-gradient(90deg,transparent,var(--grey-light),transparent)}
@media (max-width:600px){nav{padding:.5rem 1rem}.card{padding:2rem 1.25rem}.footer-links{gap:1.25rem}}
@media (prefers-reduced-motion:reduce){main::before{animation:none}}
.badge.fail{background:linear-gradient(135deg,#C0392B 0%,#E74C3C 100%);box-shadow:0 8px 24px rgba(192,57,43,.3)}
h1 code,p code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;background:var(--grey-lightest);border:1px solid var(--grey-light);color:var(--grey-darkest);padding:.1em .4em}`;

const CHECK = 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';
const WARN = 'M11 7h2v7h-2zm0 9h2v2h-2z';

/** The page the browser shows after sign-in. `body` is HTML, so escape anything that came from outside. */
export function callbackPage(ok: boolean, title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Uncola CLI</title><link rel="icon" type="image/svg+xml" href="https://uncola.ai/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Playfair+Display:wght@600;700;900&display=swap" rel="stylesheet">
<style>${STYLE}</style></head><body>
<nav><a class="logo" href="https://uncola.ai/"><div class="logo-icon">${LOGO}</div><div class="logo-text">Uncola</div></a></nav>
<main><div class="content">
<div class="title"><span class="title-main">Uncola</span> CLI</div>
<div class="card"><div class="badge${ok ? '' : ' fail'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ok ? CHECK : WARN}"/></svg></div><h1>${title}</h1><p>${body}</p></div>
</div></main>
<footer><div class="footer-links"><a href="mailto:support@uncola.ai">Support</a><a href="https://uncola.ai/privacy.html" target="_blank">Privacy</a><a href="https://uncola.ai/terms.html" target="_blank">Terms</a></div>
<p class="footer-copy">© ${new Date().getFullYear()} Uncola</p></footer>
</body></html>`;
}
