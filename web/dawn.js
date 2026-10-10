// GetMyYes dawn print: the homepage sky, drawn by one small fragment shader in
// the manner of a woodblock print. A bokashi sky (the printer's wiped-ink
// blend), a low sun cut by the horizon that rises as the page scrolls, flat
// kasumi haze bands drifting across, a sea of fine horizontal strokes with a
// column of glitter under the sun, and paper grain over everything.
//
// Hosts are elements with data-dawn. Each gets a canvas; the horizon and sun
// follow the host's layout (data-dawn="hero" keeps the horizon under the
// copy). Light and dark appearances get morning and pre-dawn palettes. It
// renders at a reduced resolution (a print is soft), at most 30 frames a
// second, only while on screen, never while motion is paused, and once only
// under reduced motion. Without WebGL the CSS gradient behind it stands in.
(function () {
  var hosts = Array.prototype.slice.call(document.querySelectorAll('[data-dawn]'));
  if (!hosts.length) return;

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  // Everything is measured in CSS pixels against one viewport height (U), so
  // the sun and the haze keep their size on a tall phone hero.
  var FRAG = [
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
  ].join('\n');

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var dark = matchMedia('(prefers-color-scheme: dark)');
  var root = document.documentElement;
  var scenes = [];

  function compile(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  }

  hosts.forEach(function (host) {
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    var gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
    if (!gl) return;
    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var u = {};
    ['uRes', 'uPx', 'uVH', 'uTime', 'uRise', 'uNight', 'uHz', 'uSunX'].forEach(function (name) {
      u[name] = gl.getUniformLocation(prog, name);
    });
    host.insertBefore(canvas, host.firstChild);
    host.classList.add('dawn-live');
    scenes.push({ host: host, canvas: canvas, gl: gl, u: u, kind: host.getAttribute('data-dawn'), visible: true, hz: 0.3, sunX: 0.62, rise: 0.4 });
  });
  if (!scenes.length) return;

  // The horizon sits just under the hero's copy, so text is never on the sea;
  // the closing scene keeps a low, wide horizon.
  function layout(scene) {
    var rect = scene.host.getBoundingClientRect();
    var scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.6;
    scene.canvas.width = Math.max(2, Math.round(rect.width * scale));
    scene.canvas.height = Math.max(2, Math.round(rect.height * scale));
    scene.gl.viewport(0, 0, scene.canvas.width, scene.canvas.height);
    scene.px = scene.canvas.width / Math.max(1, rect.width);
    if (scene.kind === 'hero') {
      var copy = document.querySelector('.hero-copy');
      var stage = document.querySelector('.hero .glass-stage');
      var line = copy ? copy.getBoundingClientRect().bottom - rect.top + 28 : rect.height * 0.7;
      scene.stacked = false;
      if (stage) {
        var s = stage.getBoundingClientRect();
        // Phones stack the card under the copy: the sun stays on the horizon
        // at the edge, clear of the text, instead of climbing behind it.
        scene.stacked = s.top - rect.top > line - 40;
        if (scene.stacked) line += 20;
        else line = Math.max(line, s.top - rect.top + s.height * 0.3);
        scene.sunX = scene.stacked ? 0.86 : (s.left - rect.left - 40) / rect.width;
      }
      scene.hz = Math.min(0.92, Math.max(0.08, 1 - line / rect.height));
    } else {
      scene.hz = 0.3;
      scene.sunX = 0.5;
    }
  }

  // The sun climbs as the page scrolls past the scene.
  function riseFor(scene) {
    var rect = scene.host.getBoundingClientRect();
    var vh = window.innerHeight;
    if (scene.kind === 'hero') return scene.stacked ? 0 : Math.min(1, Math.max(0, 0.35 + (-rect.top / Math.max(1, rect.height)) * 0.9));
    return Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height * 0.5)));
  }

  var start = performance.now();
  var last = 0;
  var frame = 0;
  function draw(now) {
    scenes.forEach(function (scene) {
      if (!scene.visible) return;
      var gl = scene.gl;
      gl.uniform2f(scene.u.uRes, scene.canvas.width, scene.canvas.height);
      gl.uniform1f(scene.u.uPx, scene.px || 1);
      gl.uniform1f(scene.u.uVH, window.innerHeight);
      gl.uniform1f(scene.u.uTime, reduce.matches ? 12 : (now - start) / 1000);
      gl.uniform1f(scene.u.uRise, riseFor(scene));
      gl.uniform1f(scene.u.uNight, dark.matches ? 1 : 0);
      gl.uniform1f(scene.u.uHz, scene.hz);
      gl.uniform1f(scene.u.uSunX, scene.sunX);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
  }
  function loop(now) {
    frame = 0;
    if (now - last > 32) {
      last = now;
      draw(now);
    }
    if (!reduce.matches && !root.classList.contains('motion-paused') && scenes.some(function (s) { return s.visible; })) {
      frame = requestAnimationFrame(loop);
    }
  }
  function wake() {
    if (!frame) frame = requestAnimationFrame(loop);
  }
  function redraw() {
    scenes.forEach(layout);
    draw(performance.now());
    wake();
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        scenes.forEach(function (scene) {
          if (scene.host === entry.target) scene.visible = entry.isIntersecting;
        });
      });
      wake();
    });
    scenes.forEach(function (scene) { io.observe(scene.host); });
  }
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(redraw);
    scenes.forEach(function (scene) { ro.observe(scene.host); });
  }
  // Scrolling moves the sun even when motion is paused or reduced: the reader
  // is driving it, so it is drawn on scroll rather than by the clock.
  var pending = 0;
  window.addEventListener('scroll', function () {
    if (pending) return;
    pending = requestAnimationFrame(function (now) {
      pending = 0;
      draw(now);
    });
  }, { passive: true });
  dark.addEventListener && dark.addEventListener('change', redraw);
  new MutationObserver(wake).observe(root, { attributes: true, attributeFilter: ['class'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
  redraw();
})();
