/* global hexo */
'use strict';

// Renders $inline$ and $$display$$ maths with KaTeX when the site is built.
// Requires: npm install katex
//
// The maths is swapped for a placeholder before the Markdown step, so Markdown
// can't mistake a _ or * in a formula for formatting. Code is left alone.
// Write \$ for a literal dollar sign.

const katex = require('katex');

const TOKENS = /(^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\2[ \t]*$|(`+)[^\n]*?\3|\\\$)|\$\$([\s\S]+?)\$\$|\$(?![\s$])([^$\n]*?[^\s$\\])\$(?!\d)/gm;
const PLACEHOLDER = /(<p>)?KATEXMATH(\d+)X(<\/p>)?/g;

const rendered = [];

hexo.extend.filter.register('before_post_render', data => {
  if (!data.content) return data;

  data.content = data.content.replace(TOKENS, (match, skip, _fence, _ticks, display, inline) => {
    if (skip) return match;
    const isDisplay = display !== undefined;
    rendered.push({
      html: katex.renderToString((isDisplay ? display : inline).trim(), {
        displayMode: isDisplay,
        throwOnError: false
      }),
      isDisplay
    });
    return `KATEXMATH${rendered.length - 1}X`;
  });

  return data;
}, 1);

hexo.extend.filter.register('after_post_render', data => {
  const restore = text => text.replace(PLACEHOLDER, (match, open, index, close) => {
    const { html, isDisplay } = rendered[Number(index)];
    if (isDisplay && open && close) return html;
    return `${open || ''}${html}${close || ''}`;
  });

  for (const field of ['content', 'excerpt', 'more']) {
    if (data[field]) data[field] = restore(data[field]);
  }
  return data;
});

const stylesheet = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/katex.min.css">`;
hexo.extend.injector.register('head_end', stylesheet, 'post');
hexo.extend.injector.register('head_end', stylesheet, 'page');
