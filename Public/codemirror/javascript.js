!(function (e) {
  "object" == typeof exports && "object" == typeof module
    ? e(require("../../lib/codemirror"))
    : "function" == typeof define && define.amd
    ? define(["../../lib/codemirror"], e)
    : e(CodeMirror);
})(function (rt) {
  "use strict";
  rt.defineMode("javascript", function (e, l) {
    var t,
      r,
      O,
      P,
      f = e.indentUnit,
      N = l.statementIndent,
      U = l.jsonld,
      o = l.json || U,
      W = !1 !== l.trackScope,
      u = l.typescript,
      B = l.wordCharacters || /[\w$\xa1-\uffff]/,
      F =
        ((e = n("keyword a")),
        (t = n("keyword b")),
        (r = n("keyword c")),
        (O = n("keyword d")),
        (P = n("operator")),
        {
          if: n("if"),
          while: e,
          with: e,
          else: t,
          do: t,
          try: t,
          finally: t,
          return: O,
          break: O,
          continue: O,
          new: n("new"),
          delete: r,
          void: r,
          throw: r,
          debugger: n("debugger"),
          var: n("var"),
          const: n("var"),
          let: n("var"),
          function: n("function"),
          catch: n("catch"),
          for: n("for"),
          switch: n("switch"),
          case: n("case"),
          default: n("default"),
          in: P,
          typeof: P,
          instanceof: P,
          true: (e = { type: "atom", style: "atom" }),
          false: e,
          null: e,
          undefined: e,
          NaN: e,
          Infinity: e,
          this: n("this"),
          class: n("class"),
          super: n("atom"),
          yield: r,
          export: n("export"),
          import: n("import"),
          extends: r,
          await: r,
        });
    function n(e) {
      return { type: e, style: "keyword" };
    }
    var H,
      D,
      G = /[+\-*&%=<>!?|~^@]/,
      J =
        /^@(context|id|value|language|type|container|list|set|reverse|index|base|vocab|graph)"/;
    function i(e, t, r) {
      return (H = e), (D = r), t;
    }
    function d(e, t) {
      var a,
        r = e.next();
      if ('"' == r || "'" == r)
        return (
          (t.tokenize =
            ((a = r),
            function (e, t) {
              var r,
                n = !1;
              if (U && "@" == e.peek() && e.match(J))
                return (t.tokenize = d), i("jsonld-keyword", "meta");
              for (; null != (r = e.next()) && (r != a || n); )
                n = !n && "\\" == r;
              return n || (t.tokenize = d), i("string", "string");
            })),
          t.tokenize(e, t)
        );
      if ("." == r && e.match(/^\d[\d_]*(?:[eE][+\-]?[\d_]+)?/))
        return i("number", "number");
      if ("." == r && e.match("..")) return i("spread", "meta");
      if (/[\[\]{}\(\),;\:\.]/.test(r)) return i(r);
      if ("=" == r && e.eat(">")) return i("=>", "operator");
      if ("0" == r && e.match(/^(?:x[\dA-Fa-f_]+|o[0-7_]+|b[01_]+)n?/))
        return i("number", "number");
      if (/\d/.test(r))
        return (
          e.match(/^[\d_]*(?:n|(?:\.[\d_]*)?(?:[eE][+\-]?[\d_]+)?)?/),
          i("number", "number")
        );
      if ("/" == r)
        return e.eat("*")
          ? (t.tokenize = K)(e, t)
          : e.eat("/")
          ? (e.skipToEnd(), i("comment", "comment"))
          : tt(e, t, 1)
          ? ((function (e) {
              for (var t, r = !1, n = !1; null != (t = e.next()); ) {
                if (!r) {
                  if ("/" == t && !n) return;
                  "[" == t ? (n = !0) : n && "]" == t && (n = !1);
                }
                r = !r && "\\" == t;
              }
            })(e),
            e.match(/^\b(([gimyus])(?![gimyus]*\2))+\b/),
            i("regexp", "string-2"))
          : (e.eat("="), i("operator", "operator", e.current()));
      if ("`" == r) return (t.tokenize = L)(e, t);
      if ("#" == r && "!" == e.peek()) return e.skipToEnd(), i("meta", "meta");
      if ("#" == r && e.eatWhile(B)) return i("variable", "property");
      if (
        ("<" == r && e.match("!--")) ||
        ("-" == r && e.match("->") && !/\S/.test(e.string.slice(0, e.start)))
      )
        return e.skipToEnd(), i("comment", "comment");
      if (G.test(r))
        return (
          (">" == r && t.lexical && ">" == t.lexical.type) ||
            (e.eat("=")
              ? ("!" != r && "=" != r) || e.eat("=")
              : /[<>*+\-|&?]/.test(r) && (e.eat(r), ">" == r && e.eat(r))),
          "?" == r && e.eat(".")
            ? i(".")
            : i("operator", "operator", e.current())
        );
      if (B.test(r)) {
        e.eatWhile(B);
        r = e.current();
        if ("." != t.lastType) {
          if (F.propertyIsEnumerable(r)) return i((t = F[r]).type, t.style, r);
          if (
            "async" == r &&
            e.match(/^(\s|\/\*([^*]|\*(?!\/))*?\*\/)*[\[\(\w]/, !1)
          )
            return i("async", "keyword", r);
        }
        return i("variable", "variable", r);
      }
    }
    function K(e, t) {
      for (var r, n = !1; (r = e.next()); ) {
        if ("/" == r && n) {
          t.tokenize = d;
          break;
        }
        n = "*" == r;
      }
      return i("comment", "comment");
    }
    function L(e, t) {
      for (var r, n = !1; null != (r = e.next()); ) {
        if (!n && ("`" == r || ("$" == r && e.eat("{")))) {
          t.tokenize = d;
          break;
        }
        n = !n && "\\" == r;
      }
      return i("quasi", "string-2", e.current());
    }
    function Q(e, t) {
      t.fatArrowAt && (t.fatArrowAt = null);
      var r = e.string.indexOf("=>", e.start);
      if (!(r < 0)) {
        !u ||
          ((n = /:\s*(?:\w+(?:<[^>]*>|\[\])?|\{[^}]*\})\s*$/.exec(
            e.string.slice(e.start, r)
          )) &&
            (r = n.index));
        for (var n, a = 0, i = !1, o = r - 1; 0 <= o; --o) {
          var c = e.string.charAt(o),
            s = "([{}])".indexOf(c);
          if (0 <= s && s < 3) {
            if (!a) {
              ++o;
              break;
            }
            if (0 == --a) {
              "(" == c && (i = !0);
              break;
            }
          } else if (3 <= s && s < 6) ++a;
          else if (B.test(c)) i = !0;
          else if (/["'\/`]/.test(c))
            for (; ; --o) {
              if (0 == o) return;
              if (
                e.string.charAt(o - 1) == c &&
                "\\" != e.string.charAt(o - 2)
              ) {
                o--;
                break;
              }
            }
          else if (i && !a) {
            ++o;
            break;
          }
        }
        i && !a && (t.fatArrowAt = o);
      }
    }
    var R = {
      atom: !0,
      number: !0,
      variable: !0,
      string: !0,
      regexp: !0,
      this: !0,
      import: !0,
      "jsonld-keyword": !0,
    };
    function X(e, t, r, n, a, i) {
      (this.indented = e),
        (this.column = t),
        (this.type = r),
        (this.prev = a),
        (this.info = i),
        null != n && (this.align = n);
    }
    function Y(e, t, r, n, a) {
      var i = e.cc;
      for (
        c.state = e,
          c.stream = a,
          c.marked = null,
          c.cc = i,
          c.style = t,
          e.lexical.hasOwnProperty("align") || (e.lexical.align = !0);
        ;

      )
        if ((i.length ? i.pop() : o ? x : b)(r, n)) {
          for (; i.length && i[i.length - 1].lex; ) i.pop()();
          return c.marked
            ? c.marked
            : "variable" == r &&
              (function (e, t) {
                if (W) {
                  for (var r = e.localVars; r; r = r.next)
                    if (r.name == t) return 1;
                  for (var n = e.context; n; n = n.prev)
                    for (r = n.vars; r; r = r.next) if (r.name == t) return 1;
                }
              })(e, n)
            ? "variable-2"
            : t;
        }
    }
    var c = { state: null, column: null, marked: null, cc: null };
    function s() {
      for (var e = arguments.length - 1; 0 <= e; e--) c.cc.push(arguments[e]);
    }
    function p() {
      return s.apply(null, arguments), !0;
    }
    function Z(e, t) {
      for (var r = t; r; r = r.next) if (r.name == e) return 1;
    }
    function a(e) {
      var t = c.state;
      if (((c.marked = "def"), W)) {
        if (t.context)
          if ("var" == t.lexical.info && t.context && t.context.block) {
            var r = (function e(t, r) {
              {
                var n;
                return r
                  ? r.block
                    ? (n = e(t, r.prev))
                      ? n == r.prev
                        ? r
                        : new te(n, r.vars, !0)
                      : null
                    : Z(t, r.vars)
                    ? r
                    : new te(r.prev, new re(t, r.vars), !1)
                  : null;
              }
            })(e, t.context);
            if (null != r) return void (t.context = r);
          } else if (!Z(e, t.localVars))
            return void (t.localVars = new re(e, t.localVars));
        l.globalVars &&
          !Z(e, t.globalVars) &&
          (t.globalVars = new re(e, t.globalVars));
      }
    }
    function ee(e) {
      return (
        "public" == e ||
        "private" == e ||
        "protected" == e ||
        "abstract" == e ||
        "readonly" == e
      );
    }
    function te(e, t, r) {
      (this.prev = e), (this.vars = t), (this.block = r);
    }
    function re(e, t) {
      (this.name = e), (this.next = t);
    }
    var ne = new re("this", new re("arguments", null));
    function m() {
      (c.state.context = new te(c.state.context, c.state.localVars, !1)),
        (c.state.localVars = ne);
    }
    function ae() {
      (c.state.context = new te(c.state.context, c.state.localVars, !0)),
        (c.state.localVars = null);
    }
    function k() {
      (c.state.localVars = c.state.context.vars),
        (c.state.context = c.state.context.prev);
    }
    function v(n, a) {
      function e() {
        var e = c.state,
          t = e.indented;
        if ("stat" == e.lexical.type) t = e.lexical.indented;
        else
          for (var r = e.lexical; r && ")" == r.type && r.align; r = r.prev)
            t = r.indented;
        e.lexical = new X(t, c.stream.column(), n, null, e.lexical, a);
      }
      return (e.lex = !0), e;
    }
    function y() {
      var e = c.state;
      e.lexical.prev &&
        (")" == e.lexical.type && (e.indented = e.lexical.indented),
        (e.lexical = e.lexical.prev));
    }
    function w(r) {
      return function e(t) {
        return t == r
          ? p()
          : ";" == r || "}" == t || ")" == t || "]" == t
          ? s()
          : p(e);
      };
    }
    function b(e, t) {
      return "var" == e
        ? p(v("vardef", t), qe, w(";"), y)
        : "keyword a" == e
        ? p(v("form"), oe, b, y)
        : "keyword b" == e
        ? p(v("form"), b, y)
        : "keyword d" == e
        ? c.stream.match(/^\s*$/, !1)
          ? p()
          : p(v("stat"), g, w(";"), y)
        : "debugger" == e
        ? p(w(";"))
        : "{" == e
        ? p(v("}"), ae, be, y, k)
        : ";" == e
        ? p()
        : "if" == e
        ? ("else" == c.state.lexical.info &&
            c.state.cc[c.state.cc.length - 1] == y &&
            c.state.cc.pop()(),
          p(v("form"), oe, b, y, Oe))
        : "function" == e
        ? p(q)
        : "for" == e
        ? p(v("form"), ae, Pe, b, k, y)
        : "class" == e || (u && "interface" == t)
        ? ((c.marked = "keyword"), p(v("form", "class" == e ? e : t), Fe, y))
        : "variable" == e
        ? u && "declare" == t
          ? ((c.marked = "keyword"), p(b))
          : u &&
            ("module" == t || "enum" == t || "type" == t) &&
            c.stream.match(/^\s*\w/, !1)
          ? ((c.marked = "keyword"),
            "enum" == t
              ? p(Ze)
              : "type" == t
              ? p(We, w("operator"), z, w(";"))
              : p(v("form"), T, w("{"), v("}"), be, y, y))
          : u && "namespace" == t
          ? ((c.marked = "keyword"), p(v("form"), x, b, y))
          : u && "abstract" == t
          ? ((c.marked = "keyword"), p(b))
          : p(v("stat"), me)
        : "switch" == e
        ? p(v("form"), oe, w("{"), v("}", "switch"), ae, be, y, y, k)
        : "case" == e
        ? p(x, w(":"))
        : "default" == e
        ? p(w(":"))
        : "catch" == e
        ? p(v("form"), m, ie, b, y, k)
        : "export" == e
        ? p(v("stat"), Ge, y)
        : "import" == e
        ? p(v("stat"), Ke, y)
        : "async" == e
        ? p(b)
        : "@" == t
        ? p(x, b)
        : s(v("stat"), x, w(";"), y);
    }
    function ie(e) {
      if ("(" == e) return p(S, w(")"));
    }
    function x(e, t) {
      return ce(e, t, !1);
    }
    function h(e, t) {
      return ce(e, t, !0);
    }
    function oe(e) {
      return "(" != e ? s() : p(v(")"), g, w(")"), y);
    }
    function ce(e, t, r) {
      if (c.state.fatArrowAt == c.stream.start) {
        var n = r ? fe : le;
        if ("(" == e) return p(m, v(")"), V(S, ")"), y, w("=>"), n, k);
        if ("variable" == e) return s(m, T, w("=>"), n, k);
      }
      var a,
        n = r ? M : j;
      return R.hasOwnProperty(e)
        ? p(n)
        : "function" == e
        ? p(q, n)
        : "class" == e || (u && "interface" == t)
        ? ((c.marked = "keyword"), p(v("form"), Be, y))
        : "keyword c" == e || "async" == e
        ? p(r ? h : x)
        : "(" == e
        ? p(v(")"), g, w(")"), y, n)
        : "operator" == e || "spread" == e
        ? p(r ? h : x)
        : "[" == e
        ? p(v("]"), Ye, y, n)
        : "{" == e
        ? we(ve, "}", null, n)
        : "quasi" == e
        ? s(se, n)
        : "new" == e
        ? p(
            ((a = r),
            function (e) {
              return "." == e
                ? p(a ? pe : de)
                : "variable" == e && u
                ? p(Ie, a ? M : j)
                : s(a ? h : x);
            })
          )
        : p();
    }
    function g(e) {
      return e.match(/[;\}\)\],]/) ? s() : s(x);
    }
    function j(e, t) {
      return "," == e ? p(g) : M(e, t, !1);
    }
    function M(e, t, r) {
      var n = 0 == r ? j : M,
        a = 0 == r ? x : h;
      return "=>" == e
        ? p(m, r ? fe : le, k)
        : "operator" == e
        ? /\+\+|--/.test(t) || (u && "!" == t)
          ? p(n)
          : u && "<" == t && c.stream.match(/^([^<>]|<[^<>]*>)*>\s*\(/, !1)
          ? p(v(">"), V(z, ">"), y, n)
          : "?" == t
          ? p(x, w(":"), a)
          : p(a)
        : "quasi" == e
        ? s(se, n)
        : ";" != e
        ? "(" == e
          ? we(h, ")", "call", n)
          : "." == e
          ? p(ke, n)
          : "[" == e
          ? p(v("]"), g, w("]"), y, n)
          : u && "as" == t
          ? ((c.marked = "keyword"), p(z, n))
          : "regexp" == e
          ? ((c.state.lastType = c.marked = "operator"),
            c.stream.backUp(c.stream.pos - c.stream.start - 1),
            p(a))
          : void 0
        : void 0;
    }
    function se(e, t) {
      return "quasi" != e
        ? s()
        : "${" != t.slice(t.length - 2)
        ? p(se)
        : p(g, ue);
    }
    function ue(e) {
      if ("}" == e)
        return (c.marked = "string-2"), (c.state.tokenize = L), p(se);
    }
    function le(e) {
      return Q(c.stream, c.state), s("{" == e ? b : x);
    }
    function fe(e) {
      return Q(c.stream, c.state), s("{" == e ? b : h);
    }
    function de(e, t) {
      if ("target" == t) return (c.marked = "keyword"), p(j);
    }
    function pe(e, t) {
      if ("target" == t) return (c.marked = "keyword"), p(M);
    }
    function me(e) {
      return ":" == e ? p(y, b) : s(j, w(";"), y);
    }
    function ke(e) {
      if ("variable" == e) return (c.marked = "property"), p();
    }
    function ve(e, t) {
      return "async" == e
        ? ((c.marked = "property"), p(ve))
        : "variable" != e && "keyword" != c.style
        ? "number" == e || "string" == e
          ? ((c.marked = U ? "property" : c.style + " property"), p(A))
          : "jsonld-keyword" == e
          ? p(A)
          : u && ee(t)
          ? ((c.marked = "keyword"), p(ve))
          : "[" == e
          ? p(x, E, w("]"), A)
          : "spread" == e
          ? p(h, A)
          : "*" == t
          ? ((c.marked = "keyword"), p(ve))
          : ":" == e
          ? s(A)
          : void 0
        : ((c.marked = "property"),
          "get" == t || "set" == t
            ? p(ye)
            : (u &&
                c.state.fatArrowAt == c.stream.start &&
                (e = c.stream.match(/^\s*:\s*/, !1)) &&
                (c.state.fatArrowAt = c.stream.pos + e[0].length),
              p(A)));
    }
    function ye(e) {
      return "variable" != e ? s(A) : ((c.marked = "property"), p(q));
    }
    function A(e) {
      return ":" == e ? p(h) : "(" == e ? s(q) : void 0;
    }
    function V(n, a, i) {
      function o(e, t) {
        var r;
        return (i ? -1 < i.indexOf(e) : "," == e)
          ? ("call" == (r = c.state.lexical).info && (r.pos = (r.pos || 0) + 1),
            p(function (e, t) {
              return e == a || t == a ? s() : s(n);
            }, o))
          : e == a || t == a
          ? p()
          : i && -1 < i.indexOf(";")
          ? s(n)
          : p(w(a));
      }
      return function (e, t) {
        return e == a || t == a ? p() : s(n, o);
      };
    }
    function we(e, t, r) {
      for (var n = 3; n < arguments.length; n++) c.cc.push(arguments[n]);
      return p(v(t, r), V(e, t), y);
    }
    function be(e) {
      return "}" == e ? p() : s(b, be);
    }
    function E(e, t) {
      if (u) return ":" == e ? p(z) : "?" == t ? p(E) : void 0;
    }
    function xe(e, t) {
      if (u && (":" == e || "in" == t)) return p(z);
    }
    function he(e) {
      if (u && ":" == e)
        return c.stream.match(/^\s*\w+\s+is\b/, !1) ? p(x, ge, z) : p(z);
    }
    function ge(e, t) {
      if ("is" == t) return (c.marked = "keyword"), p();
    }
    function z(e, t) {
      return "keyof" == t || "typeof" == t || "infer" == t || "readonly" == t
        ? ((c.marked = "keyword"), p("typeof" == t ? h : z))
        : "variable" == e || "void" == t
        ? ((c.marked = "type"), p(I))
        : "|" == t || "&" == t
        ? p(z)
        : "string" == e || "number" == e || "atom" == e
        ? p(I)
        : "[" == e
        ? p(v("]"), V(z, "]", ","), y, I)
        : "{" == e
        ? p(v("}"), Me, y, I)
        : "(" == e
        ? p(V(ze, ")"), je, I)
        : "<" == e
        ? p(V(z, ">"), z)
        : "quasi" == e
        ? s(Ve, I)
        : void 0;
    }
    function je(e) {
      if ("=>" == e) return p(z);
    }
    function Me(e) {
      return e.match(/[\}\)\]]/)
        ? p()
        : "," == e || ";" == e
        ? p(Me)
        : s(Ae, Me);
    }
    function Ae(e, t) {
      return "variable" == e || "keyword" == c.style
        ? ((c.marked = "property"), p(Ae))
        : "?" == t || "number" == e || "string" == e
        ? p(Ae)
        : ":" == e
        ? p(z)
        : "[" == e
        ? p(w("variable"), xe, w("]"), Ae)
        : "(" == e
        ? s(C, Ae)
        : e.match(/[;\}\)\],]/)
        ? void 0
        : p();
    }
    function Ve(e, t) {
      return "quasi" != e
        ? s()
        : "${" != t.slice(t.length - 2)
        ? p(Ve)
        : p(z, Ee);
    }
    function Ee(e) {
      if ("}" == e)
        return (c.marked = "string-2"), (c.state.tokenize = L), p(Ve);
    }
    function ze(e, t) {
      return ("variable" == e && c.stream.match(/^\s*[?:]/, !1)) || "?" == t
        ? p(ze)
        : ":" == e
        ? p(z)
        : "spread" == e
        ? p(ze)
        : s(z);
    }
    function I(e, t) {
      return "<" == t
        ? p(v(">"), V(z, ">"), y, I)
        : "|" == t || "." == e || "&" == t
        ? p(z)
        : "[" == e
        ? p(z, w("]"), I)
        : "extends" == t || "implements" == t
        ? ((c.marked = "keyword"), p(z))
        : "?" == t
        ? p(z, w(":"), z)
        : void 0;
    }
    function Ie(e, t) {
      if ("<" == t) return p(v(">"), V(z, ">"), y, I);
    }
    function Te() {
      return s(z, $e);
    }
    function $e(e, t) {
      if ("=" == t) return p(z);
    }
    function qe(e, t) {
      return "enum" == t ? ((c.marked = "keyword"), p(Ze)) : s(T, E, $, _e);
    }
    function T(e, t) {
      return u && ee(t)
        ? ((c.marked = "keyword"), p(T))
        : "variable" == e
        ? (a(t), p())
        : "spread" == e
        ? p(T)
        : "[" == e
        ? we(Se, "]")
        : "{" == e
        ? we(Ce, "}")
        : void 0;
    }
    function Ce(e, t) {
      return "variable" != e || c.stream.match(/^\s*:/, !1)
        ? ("variable" == e && (c.marked = "property"),
          "spread" == e
            ? p(T)
            : "}" == e
            ? s()
            : "[" == e
            ? p(x, w("]"), w(":"), Ce)
            : p(w(":"), T, $))
        : (a(t), p($));
    }
    function Se() {
      return s(T, $);
    }
    function $(e, t) {
      if ("=" == t) return p(h);
    }
    function _e(e) {
      if ("," == e) return p(qe);
    }
    function Oe(e, t) {
      if ("keyword b" == e && "else" == t) return p(v("form", "else"), b, y);
    }
    function Pe(e, t) {
      return "await" == t ? p(Pe) : "(" == e ? p(v(")"), Ne, y) : void 0;
    }
    function Ne(e) {
      return "var" == e ? p(qe, Ue) : ("variable" == e ? p : s)(Ue);
    }
    function Ue(e, t) {
      return ")" == e
        ? p()
        : ";" == e
        ? p(Ue)
        : "in" == t || "of" == t
        ? ((c.marked = "keyword"), p(x, Ue))
        : s(x, Ue);
    }
    function q(e, t) {
      return "*" == t
        ? ((c.marked = "keyword"), p(q))
        : "variable" == e
        ? (a(t), p(q))
        : "(" == e
        ? p(m, v(")"), V(S, ")"), y, he, b, k)
        : u && "<" == t
        ? p(v(">"), V(Te, ">"), y, q)
        : void 0;
    }
    function C(e, t) {
      return "*" == t
        ? ((c.marked = "keyword"), p(C))
        : "variable" == e
        ? (a(t), p(C))
        : "(" == e
        ? p(m, v(")"), V(S, ")"), y, he, k)
        : u && "<" == t
        ? p(v(">"), V(Te, ">"), y, C)
        : void 0;
    }
    function We(e, t) {
      return "keyword" == e || "variable" == e
        ? ((c.marked = "type"), p(We))
        : "<" == t
        ? p(v(">"), V(Te, ">"), y)
        : void 0;
    }
    function S(e, t) {
      return (
        "@" == t && p(x, S),
        "spread" == e
          ? p(S)
          : u && ee(t)
          ? ((c.marked = "keyword"), p(S))
          : u && "this" == e
          ? p(E, $)
          : s(T, E, $)
      );
    }
    function Be(e, t) {
      return ("variable" == e ? Fe : He)(e, t);
    }
    function Fe(e, t) {
      if ("variable" == e) return a(t), p(He);
    }
    function He(e, t) {
      return "<" == t
        ? p(v(">"), V(Te, ">"), y, He)
        : "extends" == t || "implements" == t || (u && "," == e)
        ? ("implements" == t && (c.marked = "keyword"), p(u ? z : x, He))
        : "{" == e
        ? p(v("}"), _, y)
        : void 0;
    }
    function _(e, t) {
      return "async" == e ||
        ("variable" == e &&
          ("static" == t || "get" == t || "set" == t || (u && ee(t))) &&
          c.stream.match(/^\s+[\w$\xa1-\uffff]/, !1))
        ? ((c.marked = "keyword"), p(_))
        : "variable" == e || "keyword" == c.style
        ? ((c.marked = "property"), p(De, _))
        : "number" == e || "string" == e
        ? p(De, _)
        : "[" == e
        ? p(x, E, w("]"), De, _)
        : "*" == t
        ? ((c.marked = "keyword"), p(_))
        : u && "(" == e
        ? s(C, _)
        : ";" == e || "," == e
        ? p(_)
        : "}" == e
        ? p()
        : "@" == t
        ? p(x, _)
        : void 0;
    }
    function De(e, t) {
      if ("!" == t) return p(De);
      if ("?" == t) return p(De);
      if (":" == e) return p(z, $);
      if ("=" == t) return p(h);
      e = c.state.lexical.prev;
      return s(e && "interface" == e.info ? C : q);
    }
    function Ge(e, t) {
      return "*" == t
        ? ((c.marked = "keyword"), p(Xe, w(";")))
        : "default" == t
        ? ((c.marked = "keyword"), p(x, w(";")))
        : "{" == e
        ? p(V(Je, "}"), Xe, w(";"))
        : s(b);
    }
    function Je(e, t) {
      return "as" == t
        ? ((c.marked = "keyword"), p(w("variable")))
        : "variable" == e
        ? s(h, Je)
        : void 0;
    }
    function Ke(e) {
      return "string" == e
        ? p()
        : "(" == e
        ? s(x)
        : "." == e
        ? s(j)
        : s(Le, Qe, Xe);
    }
    function Le(e, t) {
      return "{" == e
        ? we(Le, "}")
        : ("variable" == e && a(t), "*" == t && (c.marked = "keyword"), p(Re));
    }
    function Qe(e) {
      if ("," == e) return p(Le, Qe);
    }
    function Re(e, t) {
      if ("as" == t) return (c.marked = "keyword"), p(Le);
    }
    function Xe(e, t) {
      if ("from" == t) return (c.marked = "keyword"), p(x);
    }
    function Ye(e) {
      return "]" == e ? p() : s(V(h, "]"));
    }
    function Ze() {
      return s(v("form"), T, w("{"), v("}"), V(et, "}"), y, y);
    }
    function et() {
      return s(T, $);
    }
    function tt(e, t, r) {
      return (
        (t.tokenize == d &&
          /^(?:operator|sof|keyword [bcd]|case|new|export|default|spread|[\[{}\(,;:]|=>)$/.test(
            t.lastType
          )) ||
        ("quasi" == t.lastType &&
          /\{\s*$/.test(e.string.slice(0, e.pos - (r || 0))))
      );
    }
    return (
      (m.lex = ae.lex = !0),
      (y.lex = k.lex = !0),
      {
        startState: function (e) {
          e = {
            tokenize: d,
            lastType: "sof",
            cc: [],
            lexical: new X((e || 0) - f, 0, "block", !1),
            localVars: l.localVars,
            context: l.localVars && new te(null, null, !1),
            indented: e || 0,
          };
          return (
            l.globalVars &&
              "object" == typeof l.globalVars &&
              (e.globalVars = l.globalVars),
            e
          );
        },
        token: function (e, t) {
          if (
            (e.sol() &&
              (t.lexical.hasOwnProperty("align") || (t.lexical.align = !1),
              (t.indented = e.indentation()),
              Q(e, t)),
            t.tokenize != K && e.eatSpace())
          )
            return null;
          var r = t.tokenize(e, t);
          return "comment" == H
            ? r
            : ((t.lastType =
                "operator" != H || ("++" != D && "--" != D) ? H : "incdec"),
              Y(t, r, H, D, e));
        },
        indent: function (e, t) {
          if (e.tokenize == K || e.tokenize == L) return rt.Pass;
          if (e.tokenize != d) return 0;
          var r,
            n = t && t.charAt(0),
            a = e.lexical;
          if (!/^\s*else\b/.test(t))
            for (var i = e.cc.length - 1; 0 <= i; --i) {
              var o = e.cc[i];
              if (o == y) a = a.prev;
              else if (o != Oe && o != k) break;
            }
          for (
            ;
            ("stat" == a.type || "form" == a.type) &&
            ("}" == n ||
              ((r = e.cc[e.cc.length - 1]) &&
                (r == j || r == M) &&
                !/^[,\.=+\-*:?[\(]/.test(t)));

          )
            a = a.prev;
          var c,
            s = (a = N && ")" == a.type && "stat" == a.prev.type ? a.prev : a)
              .type,
            u = n == s;
          return "vardef" == s
            ? a.indented +
                ("operator" == e.lastType || "," == e.lastType
                  ? a.info.length + 1
                  : 0)
            : "form" == s && "{" == n
            ? a.indented
            : "form" == s
            ? a.indented + f
            : "stat" == s
            ? a.indented +
              ((s = t),
              "operator" == (c = e).lastType ||
              "," == c.lastType ||
              G.test(s.charAt(0)) ||
              /[,.]/.test(s.charAt(0))
                ? N || f
                : 0)
            : "switch" != a.info || u || 0 == l.doubleIndentSwitch
            ? a.align
              ? a.column + (u ? 0 : 1)
              : a.indented + (u ? 0 : f)
            : a.indented + (/^(?:case|default)\b/.test(t) ? f : 2 * f);
        },
        electricInput: /^\s*(?:case .*?:|default:|\{|\})$/,
        blockCommentStart: o ? null : "/*",
        blockCommentEnd: o ? null : "*/",
        blockCommentContinue: o ? null : " * ",
        lineComment: o ? null : "//",
        fold: "brace",
        closeBrackets: "()[]{}''\"\"``",
        helperType: o ? "json" : "javascript",
        jsonldMode: U,
        jsonMode: o,
        expressionAllowed: tt,
        skipExpression: function (e) {
          Y(e, "atom", "atom", "true", new rt.StringStream("", 2, null));
        },
      }
    );
  }),
    rt.registerHelper("wordChars", "javascript", /[\w$]/),
    rt.defineMIME("text/javascript", "javascript"),
    rt.defineMIME("text/ecmascript", "javascript"),
    rt.defineMIME("application/javascript", "javascript"),
    rt.defineMIME("application/x-javascript", "javascript"),
    rt.defineMIME("application/ecmascript", "javascript"),
    rt.defineMIME("application/json", { name: "javascript", json: !0 }),
    rt.defineMIME("application/x-json", { name: "javascript", json: !0 }),
    rt.defineMIME("application/manifest+json", {
      name: "javascript",
      json: !0,
    }),
    rt.defineMIME("application/ld+json", { name: "javascript", jsonld: !0 }),
    rt.defineMIME("text/typescript", { name: "javascript", typescript: !0 }),
    rt.defineMIME("application/typescript", {
      name: "javascript",
      typescript: !0,
    });
});