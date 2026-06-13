// central repository of the 7 tileable vector doodle templates for the custom wallpaper feature

export const parseSvgGradient = (gradientStr) => {
  if (!gradientStr) return null;
  let type = 'linear';
  if (gradientStr.startsWith('radial-gradient')) type = 'radial';
  else if (gradientStr.startsWith('conic-gradient')) type = 'conic';
  else if (!gradientStr.startsWith('linear-gradient')) return null;

  try {
    const angleMatch = gradientStr.match(/(\d+)deg/);
    const angle = angleMatch ? parseInt(angleMatch[1]) : 135;
    
    const colorsMatch = gradientStr.match(/(#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3})/g);
    const colors = colorsMatch && colorsMatch.length > 0 ? colorsMatch : ['#ff1493', '#00f0ff'];
    
    return { type, angle, colors };
  } catch {
    return null;
  }
};

const getGradientDefs = (parsed) => {
  if (!parsed) return '';
  const { type, angle, colors } = parsed;
  const stops = colors.map((c, i) => {
    const pct = Math.round((i / (colors.length - 1)) * 100);
    return `<stop offset="${pct}%" stop-color="${c}" />`;
  }).join('');

  if (type === 'radial') {
    return `<defs><radialGradient id="doodle-gradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">${stops}</radialGradient></defs>`;
  } else {
    // linear or conic (fallback to linear)
    const angleRad = (angle - 90) * (Math.PI / 180);
    const x1 = Math.round(50 - Math.cos(angleRad) * 50);
    const y1 = Math.round(50 - Math.sin(angleRad) * 50);
    const x2 = Math.round(50 + Math.cos(angleRad) * 50);
    const y2 = Math.round(50 + Math.sin(angleRad) * 50);
    return `<defs><linearGradient id="doodle-gradient" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stops}</linearGradient></defs>`;
  }
};

const processStroke = (strokeColor) => {
  const parsed = parseSvgGradient(strokeColor);
  if (parsed) {
    return {
      stroke: 'url(#doodle-gradient)',
      defs: getGradientDefs(parsed)
    };
  }
  return {
    stroke: strokeColor,
    defs: ''
  };
};

const bubblegumSvg = (strokeColor, opacity) => {
  const { stroke, defs } = processStroke(strokeColor);
  return `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'>${defs}<g stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='1.25' fill='none' stroke-linecap='round' stroke-linejoin='round'><g transform='rotate(-5, 80, 80)'><rect x='55' y='65' width='50' height='30' rx='8' /><path d='M62,80 H72 M67,75 V85' /><circle cx='88' cy='76' r='3.5' /><circle cx='95' cy='84' r='3.5' /><path d='M76,82 H79 M81,82 H84' /></g><g transform='rotate(12, 130, 35)'><path d='M118,35 C118,27 128,21 135,27 C141,22 150,27 149,35 C154,35 154,43 148,43 L119,43 C113,43 113,35 118,35 Z' /></g><g transform='rotate(-15, 25, 125)'><path d='M25,113 L29,122 L38,123 L31,130 L33,139 L25,134 L17,139 L19,130 L12,123 L21,122 Z' /></g><g transform='rotate(8, 120, 115)'><path d='M108,108 Q120,100 132,108 T132,124 Q125,129 121,131 L121,136 L116,131 Q108,127 108,108 Z' /></g><g transform='rotate(25, 20, 35)'><path d='M20,30 Q20,35 25,35 Q20,35 20,40 Q20,35 15,35 Q20,35 20,30 Z' /></g><g transform='rotate(-15, 145, 80)'><path d='M145,75 Q145,80 150,80 Q145,80 145,85 Q145,80 140,80 Q145,80 145,75 Z' /></g><g transform='rotate(-20, 75, 25)'><path d='M75,23 C73,20 68,20 68,24 C68,28 75,32 75,32 C75,32 82,28 82,24 C82,20 77,20 75,23 Z' /></g><g transform='rotate(10, 20, 80)'><path d='M20,78 C18,75 13,75 13,79 C13,83 20,87 20,87 C20,87 27,83 27,79 C27,75 22,75 20,78 Z' /></g><circle cx='95' cy='35' r='1.5' /><circle cx='50' cy='120' r='1.2' /><circle cx='85' cy='140' r='1' /><circle cx='140' cy='140' r='1.5' /></g></svg>`;
};

const cyberpunkSvg = (strokeColor, opacity) => {
  const { stroke, defs } = processStroke(strokeColor);
  return `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'>${defs}<g stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='1.25' fill='none' stroke-linecap='round' stroke-linejoin='round'><g transform='rotate(4, 80, 80)'><rect x='55' y='65' width='50' height='26' rx='4' /><path d='M55,78 H105 M70,72 H90 M70,84 H90 M47,78 H55 M105,78 H113' /></g><g transform='rotate(-10, 30, 30)'><path d='M18,18 H38 V38 M28,18 V30' /><circle cx='18' cy='18' r='2' /><circle cx='38' cy='38' r='2' /><circle cx='28' cy='30' r='2' /></g><g transform='rotate(15, 130, 125)'><path d='M118,113 L138,113 L142,117 L142,137 L118,137 Z M123,113 L123,121 L135,121 L135,113 M124,137 L124,130 L136,130 L136,137' /></g><g transform='rotate(-8, 130, 30)'><rect x='118' y='18' width='24' height='24' rx='3' /><path d='M118,30 H142 M130,18 V42' /><circle cx='124' cy='24' r='1.5' /><circle cx='136' cy='36' r='1.5' /></g><g transform='rotate(20, 20, 80)'><path d='M16,80 L24,80 M20,76 L20,84' /></g><g transform='rotate(-15, 145, 80)'><path d='M141,80 L149,80 M145,76 L145,84' /></g><g transform='rotate(15, 75, 25)'><path d='M73,20 H77 V30 M72,30 H78' /></g><g transform='rotate(-10, 45, 125)'><rect x='41' y='120' width='8' height='10' rx='3' /></g><circle cx='95' cy='35' r='1.5' /><circle cx='85' cy='140' r='1' /><circle cx='15' cy='145' r='1.2' /><circle cx='145' cy='145' r='1.5' /></g></svg>`;
};

const dollhouseSvg = (strokeColor, opacity) => {
  const { stroke, defs } = processStroke(strokeColor);
  return `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'>${defs}<g stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='1.25' fill='none' stroke-linecap='round' stroke-linejoin='round'><g transform='rotate(-4, 80, 75)'><path d='M55,70 C55,50 66,40 80,40 C94,40 105,50 105,70 C105,85 96,95 80,95 C66,95 55,85 55,70 Z M60,70 C60,55 69,45 80,45 C91,45 100,55 100,70 C100,82 92,90 80,90 C69,90 60,82 60,70 Z M80,95 V106 M68,106 H92 M76,40 C78,38 80,41 80,41 C80,41 82,38 84,40 C86,42 82,44 80,43 C78,44 74,42 76,40 Z' /></g><g transform='rotate(12, 30, 30)'><path d='M28,42 Q33,31 28,17 M28,17 Q37,12 40,17 M28,17 Q22,9 16,17 M28,17 Q35,23 37,30 M28,17 Q22,23 18,30 M28,17 Q30,8 28,6' /></g><g transform='rotate(-10, 130, 125)'><circle cx='130' cy='130' r='10' /><path d='M123,119 L137,119 L141,111 L130,103 L119,111 Z M119,111 L141,111 M130,103 L130,119' /></g><g transform='rotate(15, 130, 32)'><path d='M118,32 C110,18 105,32 118,37 Z M118,37 C131,32 126,18 118,32 Z M118,37 L110,49 M118,37 L126,49' /><circle cx='118' cy='34.5' r='2.5' /></g><g transform='rotate(30, 25, 80)'><path d='M25,74 V86 M19,80 H31 M21,76 L29,84 M21,84 L29,76' /></g><g transform='rotate(-20, 145, 80)'><path d='M145,74 V86 M139,80 H151 M141,76 L149,84 M141,84 L149,76' /></g><g transform='rotate(-15, 75, 20)'><path d='M75,18 C73,15 68,15 68,19 C68,23 75,27 75,27 C75,27 82,23 82,19 C82,15 77,15 75,18 Z' /></g><g transform='rotate(25, 25, 130)'><rect x='21' y='123' width='8' height='14' rx='1' /><path d='M21,123 H29 M22,123 V115 L28,115 V123' /></g><circle cx='95' cy='35' r='1.5' /><circle cx='85' cy='140' r='1.2' /><circle cx='10' cy='80' r='1.5' /><circle cx='50' cy='140' r='1' /></g></svg>`;
};

const builderSvg = (strokeColor, opacity) => {
  const { stroke, defs } = processStroke(strokeColor);
  return `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'>${defs}<g stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='1.25' fill='none' stroke-linecap='round' stroke-linejoin='round'><g transform='rotate(-5, 80, 85)'><circle cx='80' cy='85' r='18' /><circle cx='80' cy='85' r='8' /><path d='M80,61 V67 M80,103 V109 M56,85 H62 M98,85 H104 M63,68 L68,73 M97,102 L92,97 M63,102 L68,97 M97,68 L92,73' /><circle cx='80' cy='85' r='24' stroke-dasharray='4 4' /></g><g transform='rotate(12, 125, 125)'><rect x='112' y='116' width='26' height='15' rx='2' /><path d='M117,116 V112 M125,116 V112 M133,116 V112' /></g><g transform='rotate(-15, 30, 30)'><path d='M16,16 H44 V24 H24 V44 H16 Z' /><path d='M28,16 V20 M38,16 V20 M16,28 H20 M16,38 H20' /></g><g transform='rotate(20, 125, 30)'><path d='M125,14 L114,40 M125,14 L136,40 M119,30 H131' /><circle cx='125' cy='14' r='2.5' /></g><g transform='rotate(45, 25, 80)'><path d='M17,80 H33 M25,72 V88' /><circle cx='25' cy='80' r='3.5' /></g><g transform='rotate(-30, 145, 80)'><path d='M137,80 H153 M145,72 V88' /><circle cx='145' cy='80' r='3.5' /></g><g transform='rotate(10, 80, 22)'><path d='M72,22 H88 M80,16 V28' /></g><circle cx='95' cy='45' r='1.5' /><circle cx='85' cy='140' r='1.2' /><circle cx='45' cy='125' r='1' /><circle cx='105' cy='25' r='1.5' /></g></svg>`;
};

const classicSvg = (strokeColor, opacity) => {
  const { stroke, defs } = processStroke(strokeColor);
  return `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'>${defs}<g stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='1.25' fill='none' stroke-linecap='round' stroke-linejoin='round'><g transform='rotate(-5, 80, 85)'><circle cx='80' cy='85' r='22' /><circle cx='80' cy='85' r='12' /><circle cx='100' cy='85' r='16' /></g><g transform='rotate(12, 125, 125)'><path d='M110,120 Q120,110 130,120 T150,120 M110,128 Q120,118 130,128 T150,128' /></g><g transform='rotate(-15, 30, 30)'><path d='M16,16 L44,22 L28,44 Z' /></g><g transform='rotate(20, 125, 30)'><path d='M112,25 C112,16 138,16 138,25 C138,34 112,34 112,25 Z' /></g><g transform='rotate(45, 25, 80)'><path d='M17,80 H33 M25,72 V88' /></g><g transform='rotate(-30, 145, 80)'><path d='M137,80 H153 M145,72 V88' /></g><circle cx='95' cy='45' r='1.5' /><circle cx='85' cy='140' r='1.2' /><circle cx='45' cy='125' r='1' /><circle cx='105' cy='25' r='1.5' /></g></svg>`;
};

const darkyellowSvg = (strokeColor, opacity) => {
  const { stroke, defs } = processStroke(strokeColor);
  return `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'>${defs}<g stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='1.25' fill='none' stroke-linecap='round' stroke-linejoin='round'><g transform='rotate(-5, 80, 85)'><path d='M80,60 L106,105 H54 Z' /><path d='M80,73 V90' stroke-width='2' /><circle cx='80' cy='98' r='1.5' fill='currentColor' /></g><g transform='rotate(12, 125, 125)'><path d='M113,125 L119,114 H131 L137,125 L131,136 H119 Z' /><circle cx='125' cy='125' r='5' /></g><g transform='rotate(-15, 30, 30)'><path d='M12,30 L30,12 M20,30 L38,12 M28,30 L46,12 M36,30 L54,12' /></g><g transform='rotate(18, 125, 30)'><path d='M113,20 H137 M113,26 H137 M113,32 H137 M113,38 H137' /></g><g transform='rotate(45, 25, 80)'><path d='M17,80 H33 M25,72 V88' /></g><g transform='rotate(-30, 145, 80)'><path d='M137,80 H153 M145,72 V88' /></g><circle cx='95' cy='45' r='1.5' /><circle cx='85' cy='140' r='1.2' /><circle cx='45' cy='125' r='1.2' /><circle cx='105' cy='25' r='1.5' /><path d='M0,150 L160,150' stroke-dasharray='4 8' /></g></svg>`;
};

const sketchbookSvg = (strokeColor, opacity) => {
  const { stroke, defs } = processStroke(strokeColor);
  return `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'>${defs}<g stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='1.25' fill='none' stroke-linecap='round' stroke-linejoin='round'><g transform='rotate(-6, 75, 75)'><path d='M75,48 C58,48 50,59 50,72 C50,88 63,93 66,101 V109 H84 V101 C87,93 100,88 100,72 C100,59 92,48 75,48 Z M70,66 L75,72 L80,66 M70,72 H80 M66,109 H84 M68,114 H82 M75,40 V28 M42,56 L30,52 M108,56 L120,52 M47,94 L37,102 M103,94 L113,102' /></g><g transform='rotate(12, 25, 25)'><path d='M16,22 L38,22 C44,22 44,35 38,35 L16,35 C10,35 10,12 25,12 L38,12 C47,12 47,43 25,43 C12,43 5,30 18,30' /></g><g transform='rotate(-15, 130, 32)'><path d='M120,20 C105,27 107,45 125,45 C143,45 145,27 130,20 C125,18 122,19 120,20 Z' /></g><g transform='rotate(20, 135, 125)'><path d='M115,135 Q130,116 148,130 M141,120 L148,130 L137,133' /></g><g transform='rotate(30, 25, 75)'><path d='M25,70 L27,74 L31,73 L29,77 L32,80 L28,80 L25,84 L23,80 L19,80 L22,77 L20,73 Z' /></g><g transform='rotate(-20, 135, 75)'><path d='M135,70 L137,74 L141,73 L139,77 L142,80 L138,80 L135,84 L133,80 L129,80 L132,77 L130,73 Z' /></g><g transform='rotate(15, 55, 30)'><path d='M50,30 C50,25 55,23 58,25 C60,27 58,32 55,34 L55,38 M55,42 L55,42.5' /><circle cx='55' cy='42.2' r='0.5' /></g><path d='M75,20 Q80,25 85,20 T95,25 M75,120 Q80,125 85,120 T95,125' /><circle cx='95' cy='45' r='1.5' /><circle cx='95' cy='105' r='1.2' /><circle cx='20' cy='95' r='1.5' /><circle cx='145' cy='100' r='1.5' /></g></svg>`;
};

export const wallpapers = [
  { id: 'bubblegum', name: 'Bubblegum Pop', svg: bubblegumSvg, defaultColor: '#e54b7c' },
  { id: 'cyberpunk', name: 'Neo Cyberpunk', svg: cyberpunkSvg, defaultColor: '#00f0ff' },
  { id: 'dollhouse', name: 'Dreamhouse', svg: dollhouseSvg, defaultColor: '#ff1493' },
  { id: 'builder', name: 'Block Builder', svg: builderSvg, defaultColor: '#0055a5' },
  { id: 'classic', name: 'Classic SaaS', svg: classicSvg, defaultColor: '#2563eb' },
  { id: 'darkyellow', name: 'Gritty Gotham', svg: darkyellowSvg, defaultColor: '#f5c400' },
  { id: 'sketchbook', name: 'Notebook Sketch', svg: sketchbookSvg, defaultColor: '#475569' }
];

export const getWallpaperById = (id) => wallpapers.find(w => w.id === id);
