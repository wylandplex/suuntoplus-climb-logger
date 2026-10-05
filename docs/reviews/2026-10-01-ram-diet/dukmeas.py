# Duktape 2.7 (Fedora x86_64 libduktape) heap meter for a built SuuntoPlus main.js blob.
# Proxy only: watch Duktape build/config (32-bit, packed tval?, lowmem opts) is unknown.
import ctypes, ctypes.util, sys, json
lib = ctypes.CDLL('libduktape.so.207')
libc = ctypes.CDLL(ctypes.util.find_library('c'))
libc.malloc.restype = ctypes.c_void_p; libc.malloc.argtypes=[ctypes.c_size_t]
libc.realloc.restype = ctypes.c_void_p; libc.realloc.argtypes=[ctypes.c_void_p, ctypes.c_size_t]
libc.free.argtypes=[ctypes.c_void_p]
ALLOC = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t)
REALLOC = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t)
FREE = ctypes.CFUNCTYPE(None, ctypes.c_void_p, ctypes.c_void_p)
FATAL = ctypes.CFUNCTYPE(None, ctypes.c_void_p, ctypes.c_char_p)
st = {'live':0,'peak':0,'sizes':{}}
def _a(u, n):
    if n == 0: return None
    p = libc.malloc(n); st['sizes'][p]=n; st['live']+=n
    if st['live']>st['peak']: st['peak']=st['live']
    return p
def _r(u, p, n):
    old = st['sizes'].pop(p, 0) if p else 0
    if n == 0:
        if p: libc.free(p)
        st['live']-=old; return None
    q = libc.realloc(p, n); st['sizes'][q]=n; st['live']+=n-old
    if st['live']>st['peak']: st['peak']=st['live']
    return q
def _f(u, p):
    if p: st['live']-=st['sizes'].pop(p,0); libc.free(p)
def _fatal(u, m): print('FATAL', m); sys.exit(2)
ca, cr, cf, cfa = ALLOC(_a), REALLOC(_r), FREE(_f), FATAL(_fatal)
lib.duk_create_heap.restype = ctypes.c_void_p
lib.duk_create_heap.argtypes = [ALLOC, REALLOC, FREE, ctypes.c_void_p, FATAL]
lib.duk_compile_raw.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t, ctypes.c_uint]
lib.duk_eval_raw.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t, ctypes.c_uint]
lib.duk_pcall.argtypes=[ctypes.c_void_p, ctypes.c_int]
lib.duk_gc.argtypes=[ctypes.c_void_p, ctypes.c_uint]
lib.duk_safe_to_lstring.restype = ctypes.c_char_p
lib.duk_safe_to_lstring.argtypes=[ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]
lib.duk_dup.argtypes=[ctypes.c_void_p, ctypes.c_int]
lib.duk_dump_function.argtypes=[ctypes.c_void_p]
lib.duk_get_buffer_data.restype=ctypes.c_void_p
lib.duk_get_buffer_data.argtypes=[ctypes.c_void_p, ctypes.c_int, ctypes.POINTER(ctypes.c_size_t)]
lib.duk_pop.argtypes=[ctypes.c_void_p]
EVAL=1<<3; FUNC=1<<4; SAFE=1<<7; NOSOURCE=1<<9; NOFILENAME=1<<11
STUBS = b"var evalFile=function(){return function(){}},setText=function(){},unload=function(){},systemEvent=function(){},localStorage={getObject:function(){return null}};"
def gc(ctx):
    lib.duk_gc(ctx,0); lib.duk_gc(ctx,0)
def measure(blob):
    ctx = lib.duk_create_heap(ca, cr, cf, None, cfa)
    lib.duk_eval_raw(ctx, STUBS, len(STUBS), EVAL|SAFE|NOSOURCE|NOFILENAME|(1<<8)); gc(ctx)
    base = st['live']; st['peak']=st['live']
    src = blob if blob.lstrip().startswith(b'function') else b'function(){' + blob + b'\n}'
    isext = src is blob
    rc = lib.duk_compile_raw(ctx, src, len(src), FUNC|SAFE|NOSOURCE|NOFILENAME|(1<<12))
    if rc != 0: raise SystemExit('compile err ' + lib.duk_safe_to_lstring(ctx,-1,None).decode())
    compile_peak = st['peak'] - base
    gc(ctx); tmpl = st['live'] - base
    lib.duk_dup(ctx,-1); lib.duk_dump_function(ctx); sz=ctypes.c_size_t(0)
    lib.duk_get_buffer_data(ctx,-1,ctypes.byref(sz)); dump=sz.value; lib.duk_pop(ctx)
    st['peak']=st['live']
    if isext: return dict(compile_peak=compile_peak, template=tmpl, dump=dump)
    rc = lib.duk_pcall(ctx, 0)
    if rc != 0: raise SystemExit('run err ' + lib.duk_safe_to_lstring(ctx,-1,None).decode())
    gc(ctx); inst = st['live'] - base   # template + instantiated closures/arrays, dispatcher held on stack
    return dict(compile_peak=compile_peak, template=tmpl, dump=dump, resident_after_run=inst)
if __name__ == '__main__':
    out = {}
    for f in sys.argv[1:]:
        b = open(f,'rb').read()
        if b.startswith(b'// '): b = b.split(b'\n',1)[1]
        out[f] = dict(text=len(b), **measure(b))
    print(json.dumps(out, indent=1))
