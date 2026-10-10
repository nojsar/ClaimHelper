/**
 * The site's dawn-print shader (web/dawn.js), shared with the ad so the film
 * and the homepage are the same sky. Keep the two in step: this file is a
 * copy of the FRAG array there, with the same uniforms.
 */
export const DAWN_VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

export const DAWN_FRAG = [
    'precision mediump float;',
    'uniform vec2 uRes;uniform float uPx;uniform float uVH;uniform float uTime;uniform float uRise;uniform float uNight;uniform float uHz;uniform float uSunX;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
    ' return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);}',
    // four-stop bokashi, with a little of the print's banding left in
    'vec3 ramp(float t,vec3 a,vec3 b,vec3 c,vec3 d){t=mix(t,floor(t*9.)/9.,.18);',
    ' return t<.33?mix(a,b,t/.33):t<.66?mix(b,c,(t-.33)/.33):mix(c,d,(t-.66)/.34);}',
    'float band(vec2 p,vec2 c,float l,float r){vec2 q=abs(p-c)-vec2(l,0.);return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}',
    'void main(){',
    ' vec2 R=uRes/uPx;vec2 P=gl_FragCoord.xy/uPx;float U=min(R.y,uVH);',
    ' float hz=uHz*R.y;float sr=min(.085*U,84.);',
    ' vec2 sun=vec2(uSunX*R.x,hz+(-.05+uRise*.2)*U);',
    // skies: morning (light) and pre-dawn (dark)
    ' float t=clamp((P.y-hz)/max(1.,R.y-hz),0.,1.);',
    ' vec3 dayS=ramp(t,vec3(.976,.874,.722),vec3(.953,.800,.749),vec3(.859,.827,.902),vec3(.792,.839,.925));',
    ' vec3 nightS=ramp(t,vec3(.780,.510,.380),vec3(.333,.255,.380),vec3(.122,.169,.290),vec3(.051,.090,.149));',
    ' vec3 sky=mix(dayS,nightS,uNight);',
    ' float d=length(P-sun)/U;',
    ' vec3 glowC=mix(vec3(1.,.86,.62),vec3(1.,.66,.40),uNight);',
    ' sky+=glowC*exp(-d*mix(5.,3.4,uNight))*mix(.28,.42,uNight)*(.6+.4*uRise);',
    ' vec3 col=sky;',
    // god rays: soft spokes fanning out of the sun, turning very slowly
    ' vec2 dv=P-sun;float ang=atan(dv.y,dv.x);float rad=length(dv)/U;',
    ' float rays=pow(.5+.5*sin(ang*16.+n(vec2(ang*2.5,uTime*.06))*5.+uTime*.12),5.);',
    ' col+=glowC*rays*smoothstep(.02,.12,rad)*exp(-rad*2.4)*step(hz,P.y)*mix(.16,.22,uNight)*(.5+.5*uRise);',
    // the sun, cut by the horizon
    ' vec3 sunC=mix(vec3(1.,.93,.74),vec3(1.,.80,.52),uNight);',
    ' float disc=smoothstep(sr,sr-1.5,length(P-sun));col=mix(col,sunC,disc*step(hz,P.y));',
    // kasumi bands drifting, lit gold along the edge that faces the sun
    ' for(int i=0;i<4;i++){float fi=float(i);',
    '  float y=hz+(.07+fi*.105+.02*sin(fi*2.3))*U;float l=(.16+.07*fract(fi*.618))*U;',
    '  float x=fract(fi*.37+uTime*(.004+.002*fi))*(R.x+.8*U)-.4*U;',
    '  float bd=band(P,vec2(x,y),l,(.016+.004*fi)*U);',
    '  vec3 bc=mix(vec3(1.,.97,.92),vec3(.30,.31,.44),uNight);',
    '  vec3 edge=mix(vec3(1.,.82,.56),vec3(.98,.62,.40),uNight);',
    '  float lit=smoothstep(.02*U,-.02*U,P.y-y)*exp(-abs(P.x-sun.x)/U*1.2);',
    '  col=mix(col,mix(bc,edge,lit*.8),smoothstep(1.5,-1.5,bd)*mix(.72,.6,uNight));}',
    // the sea: strokes, depth, and the glitter path under the sun
    ' if(P.y<hz){float s=(hz-P.y)/hz;',
    '  vec3 dayW=mix(vec3(.553,.627,.761),vec3(.208,.329,.451),pow(s,.8));',
    '  vec3 nightW=mix(vec3(.180,.200,.290),vec3(.035,.078,.125),pow(s,.8));',
    '  vec3 w=mix(dayW,nightW,uNight);',
    // swell lines in perspective (close together at the horizon, wider toward
    // the viewer), rolling in continuously
    '  float v=hz-P.y;float z=U*.35/(v+U*.02);',
    '  float st=sin(z*9.+n(vec2(P.x/U*4.+uTime*.12,z*.6))*4.-uTime*1.3);',
    '  w*=1.+.07*smoothstep(.55,1.,st)-.04*smoothstep(.6,1.,-st);',
    // glitter: soft-ended dashes that drift and twinkle, each on its own
    // phase, longer and looser toward the viewer
    '  float ax=abs(P.x-sun.x);float wid=(.03+s*.3)*min(R.x,1.2*U);',
    '  vec2 g2=vec2((P.x+uTime*4.)/(9.+s*24.),P.y/4.5);vec2 cell=floor(g2);vec2 f=fract(g2);',
    '  float dash=smoothstep(0.,.22,f.x)*smoothstep(1.,.78,f.x)*smoothstep(.1,.4,f.y)*smoothstep(.9,.6,f.y);',
    '  float r=h(cell);float tw=.5+.5*sin(uTime*(1.6+r*2.4)+r*40.);',
    '  float g=step(.6-s*.12,r)*smoothstep(.35,1.,tw)*dash*smoothstep(wid,wid*.3,ax)*(.55+.45*uRise);',
    '  w=mix(w,mix(vec3(1.,.90,.66),vec3(1.,.72,.45),uNight),g*.85);',
    '  w+=glowC*exp(-ax/U*6.)*exp(-s*5.)*.18;',
    '  col=w;',
    '  col=mix(col,sky,smoothstep(1.5,0.,hz-P.y)*.5);}',
    // paper grain
    ' col+=(h(gl_FragCoord.xy)-.5)*.035;',
    ' gl_FragColor=vec4(col,1.);',
    '}'
  ].join("\n");
