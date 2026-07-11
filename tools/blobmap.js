// blob anatomy scanner: split top-level var declarators + capture other top-level statements
var fs = require('fs');

function scanTopLevel(src) {
  // returns {items:[{kind:'decl'|'stmt'|'comment'|'funcdecl', name, start, end, text}], }
  var i = 0, n = src.length;
  var items = [];
  function skipWs() {
    for (;;) {
      while (i < n && /\s/.test(src[i])) i++;
      if (src[i] === '/' && src[i+1] === '/') {
        var s = i;
        while (i < n && src[i] !== '\n') i++;
        items.push({kind:'comment', name:'(comment)', start:s, end:i, text:src.slice(s,i)});
      } else if (src[i] === '/' && src[i+1] === '*') {
        var s2 = i;
        i += 2;
        while (i < n && !(src[i] === '*' && src[i+1] === '/')) i++;
        i += 2;
        items.push({kind:'comment', name:'(comment)', start:s2, end:i, text:src.slice(s2,i)});
      } else break;
    }
  }
  // scan an expression until depth-0 comma or semicolon; returns end index
  function scanExpr() {
    var depth = 0;
    while (i < n) {
      var c = src[i];
      if (c === "'" || c === '"') {
        var q = c; i++;
        while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
        i++;
        continue;
      }
      if (c === '/' && src[i+1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i+1] === '*') { i+=2; while (i < n && !(src[i]==='*'&&src[i+1]==='/')) i++; i+=2; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; i++; continue; }
      if (c === ')' || c === ']' || c === '}') { depth--; i++; continue; }
      if (depth === 0 && (c === ',' || c === ';')) return;
      i++;
    }
  }
  while (i < n) {
    skipWs();
    if (i >= n) break;
    if (src.startsWith('var ', i) || src.startsWith('var\n', i)) {
      var varStart = i;
      i += 4;
      // declarators
      for (;;) {
        skipWs();
        var dStart = i;
        var m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(i, i+64));
        if (!m) { console.error('BAD declarator at', i, JSON.stringify(src.slice(i, i+40))); process.exit(1); }
        var name = m[0];
        i += name.length;
        skipWs();
        var hasInit = false;
        if (src[i] === '=' && src[i+1] !== '=') { hasInit = true; i++; scanExpr(); }
        items.push({kind:'decl', name:name, start:dStart, end:i, text:src.slice(dStart,i), hasInit:hasInit});
        if (src[i] === ',') { i++; continue; }
        if (src[i] === ';') { i++; break; }
        // ASI / EOF
        break;
      }
    } else if (src.startsWith('function ', i)) {
      var fStart = i;
      i += 9;
      var m2 = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(i, i+64));
      var fname = m2 ? m2[0] : '(anon)';
      // scan to matching close brace of body
      while (i < n && src[i] !== '{') {
        if (src[i] === "'" || src[i] === '"') { var q3=src[i]; i++; while(i<n&&src[i]!==q3){if(src[i]==='\\')i++;i++;} }
        i++;
      }
      var depth2 = 0;
      do {
        var c2 = src[i];
        if (c2 === "'" || c2 === '"') { var q2 = c2; i++; while (i < n && src[i] !== q2) { if (src[i]==='\\') i++; i++; } i++; continue; }
        if (c2 === '/' && src[i+1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c2 === '/' && src[i+1] === '*') { i+=2; while (i < n && !(src[i]==='*'&&src[i+1]==='/')) i++; i+=2; continue; }
        if (c2 === '{') depth2++;
        if (c2 === '}') depth2--;
        i++;
      } while (i < n && depth2 > 0);
      items.push({kind:'funcdecl', name:fname, start:fStart, end:i, text:src.slice(fStart,i)});
    } else {
      // other statement (e.g. "return function(...){...}") — scan to depth-0 semicolon or EOF
      var sStart = i;
      var m3 = /^[A-Za-z_$]+/.exec(src.slice(i, i+32));
      var sname = m3 ? m3[0] : src[i];
      scanExpr();
      // consume trailing separators
      var sEnd = i;
      items.push({kind:'stmt', name:'(stmt:'+sname+')', start:sStart, end:sEnd, text:src.slice(sStart,sEnd)});
      if (src[i] === ';' || src[i] === ',') i++;
    }
  }
  return items;
}

var mode = process.argv[2];
var file = process.argv[3];
var src = fs.readFileSync(file, 'utf8');
var items = scanTopLevel(src);

if (mode === 'names') {
  items.forEach(function(it) {
    if (it.kind === 'decl') console.log('decl\t' + it.name + '\t' + (it.hasInit ? (it.text.replace(/^[^=]*=\s*/,'').slice(0,30).replace(/\n/g,' ')) : '(uninit)') + '\t' + (it.end - it.start));
    if (it.kind === 'funcdecl') console.log('funcdecl\t' + it.name + '\t\t' + (it.end - it.start));
    if (it.kind === 'stmt') console.log('stmt\t' + it.name + '\t' + it.text.slice(0,40).replace(/\n/g,' ') + '\t' + (it.end - it.start));
  });
  // byte accounting
  var accounted = 0;
  items.forEach(function(it){ accounted += it.end - it.start; });
  console.error('FILE ' + src.length + ' B; item bytes ' + accounted + '; overhead(var/commas/semis/ws) ' + (src.length - accounted));
}
