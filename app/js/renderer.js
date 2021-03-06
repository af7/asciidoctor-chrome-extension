// Namespace
var asciidoctor = asciidoctor || {};
asciidoctor.chrome = asciidoctor.chrome || {};

var CUSTOM_ATTRIBUTES_KEY = 'CUSTOM_ATTRIBUTES';
var SAFE_MODE_KEY = 'SAFE_MODE';
var LIVERELOADJS_DETECTED_KEY = 'LIVERELOADJS_DETECTED';
var LIVERELOADJS_FILENAME = 'livereload.js';
var THEME_KEY = 'THEME';
var CUSTOM_THEME_PREFIX = 'CUSTOM_THEME_';
var JS_KEY = 'JS';
var JS_LOAD_KEY = 'JS_LOAD';

/**
 * Convert AsciiDoc as HTML
 */
asciidoctor.chrome.convert = function (data) {
  chrome.storage.local.get([CUSTOM_ATTRIBUTES_KEY, SAFE_MODE_KEY, JS_KEY, JS_LOAD_KEY], function (settings) {
    try {
      removeMathJaxRefreshJs();
      removeCustomJs();

      var body = $(document.body);
      // Save scripts
      var scripts = body.find('script');

      detectLiveReloadJs(scripts);

      // Clear <body>
      body.html('<div id="content"></div>');

      var loadCustomJavaScript = settings[JS_LOAD_KEY];
      var customJavaScriptName = settings[JS_KEY];
      if (customJavaScriptName) {
        var customJavaScriptKey = 'CUSTOM_JS_' + customJavaScriptName;
        chrome.storage.local.get(customJavaScriptKey, function (items) {
          if (items[customJavaScriptKey]) {
            var customJavaScript = $('<script id="asciidoctor-custom-js" type="text/javascript"></script>');
            customJavaScript.html(items[customJavaScriptKey]);
            if (loadCustomJavaScript === 'before') {
              // Load the custom JavaScript...
              $(document.body).append(customJavaScript);
              // ... then update <body>
              updateBody(data, settings, scripts);
            } else {
              // Update <body>
              updateBody(data, settings, scripts);
              // ... then load the custom JavaScript
              $(document.body).append(customJavaScript);
            }
          } else {
            // No content found for the custom JavaScript, update <body>
            updateBody(data, settings, scripts);
          }
        });
      } else {
        // No custom JavaScript defined, update <body>
        updateBody(data, settings, scripts);
      }
    }
    catch (e) {
      showErrorMessage(e.name + ' : ' + e.message);
      console.error(e.stack);
    }
  });
};

/**
 * Update the <body> with the generated HTML
 */
function updateBody(data, settings, scripts) {
  var asciidoctorDocument = Opal.Asciidoctor.$load(data, buildAsciidoctorOptions(settings));
  if (asciidoctorDocument.attributes.map['icons'] == 'font') {
    appendFontAwesomeStyle();
  }
  var generatedHtml = asciidoctorDocument.$convert();
  document.title = asciidoctorDocument.$doctitle(Opal.hash2(['sanitize'], {sanitize: true}));
  document.body.className = asciidoctorDocument.$doctype();
  var maxWidth = asciidoctorDocument.$attr('max-width');
  if (maxWidth) {
    document.body.style.maxWidth = maxWidth;
  }
  $('#content').html(generatedHtml);

  forceLoadDynamicObjects();
  refreshMathJax();
  appendScripts(scripts);
  syntaxHighlighting();
}

/**
 * Build Asciidoctor options from settings
 */
function buildAsciidoctorOptions(settings) {
  var customAttributes = settings[CUSTOM_ATTRIBUTES_KEY];
  var safeMode = settings[SAFE_MODE_KEY] || 'secure';
  // Default attributes
  var attributes = 'showtitle icons=font@ platform=opal platform-opal env=browser env-browser';
  var href = window.location.href;
  var fileName = href.split('/').pop();
  var fileExtension = fileName.split('.').pop();
  if (fileExtension !== '') {
    attributes = attributes.concat(' ').concat('outfilesuffix=.').concat(fileExtension);
  }
  if (customAttributes) {
    attributes = attributes.concat(' ').concat(customAttributes);
  }
  var pwd = Opal.File.$dirname(href);
  Opal.ENV['$[]=']("PWD", pwd);
  return Opal.hash2(['base_dir', 'safe', 'backend', 'attributes'], {
    'base_dir':pwd,
    'safe':safeMode,
    // Force backend to html5
    'backend': 'html5',
    'attributes':attributes
  });
}

/**
 * Detect LiveReload.js script to avoid multiple refreshes
 */
function detectLiveReloadJs(scripts) {
  var length = scripts.length;
  var script = null;
  var liveReloadDetected = false;
  for (var i = 0; i < length; i++) {
    script = scripts[i];
    if (script.src.indexOf(LIVERELOADJS_FILENAME) != -1) {
      // LiveReload.js detected!
      liveReloadDetected = true;
      break;
    }
  }
  var value = {};
  value[LIVERELOADJS_DETECTED_KEY] = liveReloadDetected;
  chrome.storage.local.set(value);
}

/**
 * Append saved scripts
 */
function appendScripts(scripts) {
  var length = scripts.length;
  for (var i = 0; i < length; i++) {
    var script = scripts[i];
    if (!isMathTexScript(script)) {
      document.body.appendChild(script);
    }
  }
}

function isMathTexScript(script) {
  return /math\/tex/i.test(script.type)
}

/**
 * Syntax highlighting
 */
function syntaxHighlighting() {
  $('pre.highlight > code').each(function (i, e) {
    if ((match = /language-(\S+)/.exec(e.className)) != null && hljs.getLanguage(match[1]) != null) {
      hljs.highlightBlock(e);
    }
    else {
      e.className += ' hljs';
    }
  });
}

function appendFontAwesomeStyle() {
  if ($('#font-awesome-style').length == 0) {
    var fontAwesomeLink = document.createElement('link');
    fontAwesomeLink.rel = 'stylesheet';
    fontAwesomeLink.id = 'font-awesome-style';
    fontAwesomeLink.href = chrome.extension.getURL('css/font-awesome.min.css');
    document.head.appendChild(fontAwesomeLink);
  }
}

/**
 * Append highlight.js script
 */
function appendHighlightJsScript() {
  var highlightJsScript = document.createElement('script');
  highlightJsScript.type = 'text/javascript';
  highlightJsScript.src = chrome.extension.getURL('js/vendor/highlight.min.js');
  document.head.appendChild(highlightJsScript);
}

function getDefaultThemeNames() {
  var web_accessible_resources = chrome.runtime.getManifest().web_accessible_resources;
  var themeRegexp = /^css\/themes\/(.*)\.css$/i;
  var themes = $.grep(web_accessible_resources, function (item) {
    return themeRegexp.test(item);
  });
  return themes.map(function (item) {
    return item.replace(themeRegexp, "$1");
  });
}

/**
 * Append css files
 */
function appendStyles() {
  // Theme
  chrome.storage.local.get(THEME_KEY, function (settings) {
    var theme = settings[THEME_KEY] || 'asciidoctor';
    var themeNames = getDefaultThemeNames();
    // Check if the theme is packaged in the extension... if not it's a custom theme
    if ($.inArray(theme, themeNames) !== -1) {
      var themeLink = document.createElement('link');
      themeLink.rel = 'stylesheet';
      themeLink.id = 'asciidoctor-style';
      themeLink.href = chrome.extension.getURL('css/themes/' + theme + '.css');
      document.head.appendChild(themeLink);
    } else {
      var customThemeKey = CUSTOM_THEME_PREFIX + theme;
      chrome.storage.local.get(customThemeKey, function (items) {
        if (items[customThemeKey]) {
          var themeStyle = $('<style id="asciidoctor-custom-style"></style>');
          themeStyle.html(items[customThemeKey]);
          $(document.head).append(themeStyle);
        }
      });
    }
  });
  // Highlight
  var highlightTheme = 'github';
  var highlightStylesheetLink = document.createElement('link');
  highlightStylesheetLink.rel = 'stylesheet';
  highlightStylesheetLink.id = highlightTheme + '-highlight-style';
  highlightStylesheetLink.href = chrome.extension.getURL('css/highlight/' + highlightTheme + '.css');
  document.head.appendChild(highlightStylesheetLink);
}

function appendMathJax() {
  var mathJaxJsScriptConfig = document.createElement('script');
  mathJaxJsScriptConfig.type = 'text/x-mathjax-config';
  mathJaxJsScriptConfig.text =
      'MathJax.Hub.Config({' +
          '  tex2jax: {' +
          '    inlineMath: [["\\\\(", "\\\\)"]],' +
          '    displayMath: [["\\\\[", "\\\\]"]],' +
          '    ignoreClass: "nostem|nolatexmath"' +
          '  },' +
          '  asciimath2jax: {' +
          '    delimiters: [["\\\\$", "\\\\$"]],' +
          '    ignoreClass: "nostem|noasciimath"' +
          '  }' +
          '});';
  document.head.appendChild(mathJaxJsScriptConfig);

  var mathJaxJsScript = document.createElement('script');
  mathJaxJsScript.type = 'text/javascript';
  mathJaxJsScript.src = chrome.extension.getURL('vendor/MathJax/MathJax.js?config=TeX-MML-AM_HTMLorMML');
  //mathJaxJsScript.src = chrome.extension.getURL('vendor/MathJax/MathJax.js?config=TeX-AMS_HTML');
  document.head.appendChild(mathJaxJsScript);
}

function removeMathJaxRefreshJs() {
  $('#mathjax-refresh-js').remove();
}

function removeCustomJs() {
  $('#asciidoctor-custom-js').remove();
}

function refreshMathJax() {
  var mathJaxJsScript = document.createElement('script');
  mathJaxJsScript.id = 'mathjax-refresh-js';
  mathJaxJsScript.text = 'if (window.MathJax) { window.MathJax.Hub.Typeset(); }';
  document.body.appendChild(mathJaxJsScript);
}

/**
 * Force dynamic objects to be load (iframe, script...)
 */
function forceLoadDynamicObjects() {
  // Force iframe to be load
  $('iframe').each(function() { $(this).attr('src', $(this).attr('src')) });
}

/**
 * Show error message
 * @param message The error message
 */
function showErrorMessage(message) {
  var messageText = '<p>' + message + '</p>';
  $(document.body).html('<div id="content"><h4>Error</h4>' + messageText + '</div>');
}
