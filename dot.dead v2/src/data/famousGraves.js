// Curated dead projects — every grave has a known cause of discontinuation.
// Live stats (stars, dates, last commit) refresh from the GitHub API when reachable.
// status: 'dead' | 'undead' (frozen / maintenance mode but not archived)
const FAMOUS_GRAVES = [
  {
    repo: 'atom/atom', name: 'Atom', born: 2011, died: 2022, stars: 60000, status: 'dead',
    epitaph: 'A hackable text editor for the 21st century.',
    cause: 'Outlived by its own child: Electron powered VS Code, and VS Code won.',
  },
  {
    repo: 'angular/angular.js', name: 'AngularJS', born: 2010, died: 2022, stars: 59000, status: 'dead',
    epitaph: 'Superheroic JavaScript MVW Framework.',
    cause: 'Rewritten from scratch as "Angular" — a successor that shared only the name.',
  },
  {
    repo: 'adobe/brackets', name: 'Brackets', born: 2011, died: 2021, stars: 33000, status: 'dead',
    epitaph: 'A modern open source editor that understood web design.',
    cause: 'Adobe pulled the plug. Also: VS Code, again.',
  },
  {
    repo: 'request/request', name: 'request', born: 2009, died: 2020, stars: 25000, status: 'dead',
    epitaph: 'Simplified HTTP request client.',
    cause: 'The platform caught up. fetch() needed no dependencies.',
  },
  {
    repo: 'bower/bower', name: 'Bower', born: 2012, died: 2017, stars: 15000, status: 'dead',
    epitaph: 'A package manager for the web.',
    cause: 'npm ate the frontend. Even Bower’s own docs told you to leave.',
  },
  {
    repo: 'palantir/tslint', name: 'TSLint', born: 2013, died: 2019, stars: 5900, status: 'dead',
    epitaph: 'An extensible linter for TypeScript.',
    cause: 'Deprecated in favor of ESLint; its soul lives on in typescript-eslint.',
  },
  {
    repo: 'ariya/phantomjs', name: 'PhantomJS', born: 2011, died: 2018, stars: 29000, status: 'dead',
    epitaph: 'Scriptable headless browser.',
    cause: 'Chrome shipped --headless. The phantom was exorcised.',
  },
  {
    repo: 'facebookarchive/draft-js', name: 'Draft.js', born: 2016, died: 2022, stars: 22000, status: 'dead',
    epitaph: 'A React framework for building text editors.',
    cause: 'Meta moved on to Lexical. The archive org claimed another resident.',
  },
  {
    repo: 'facebookarchive/flux', name: 'Flux', born: 2014, died: 2023, stars: 17000, status: 'dead',
    epitaph: 'Application architecture for building user interfaces.',
    cause: 'Redux won. Then hooks made everyone forget why they were fighting.',
  },
  {
    repo: 'stevemao/left-pad', name: 'left-pad', born: 2014, died: 2016, stars: 1100, status: 'dead',
    epitaph: 'String left pad. 11 lines of code.',
    cause: 'Unpublished from npm in 2016, taking half the internet down with it.',
  },
  {
    repo: 'moment/moment', name: 'Moment.js', born: 2011, died: null, stars: 48000, status: 'undead',
    epitaph: 'Parse, validate, manipulate, and display dates.',
    cause: 'Not dead. Just done. Declared itself a legacy project in 2020, by choice.',
  },
  {
    repo: 'yarnpkg/yarn', name: 'Yarn Classic', born: 2016, died: null, stars: 41000, status: 'undead',
    epitaph: 'Fast, reliable, and secure dependency management.',
    cause: 'Frozen at v1. Survived by Yarn Berry, whom nobody calls just "Yarn".',
  },
  {
    repo: 'sass/node-sass', name: 'node-sass', born: 2012, died: 2020, stars: 8400, status: 'dead',
    epitaph: 'Node bindings to LibSass.',
    cause: 'LibSass itself was deprecated; Dart Sass took the crown.',
  },
  {
    repo: 'Polymer/polymer', name: 'Polymer', born: 2012, died: 2021, stars: 21800, status: 'dead',
    epitaph: 'Use the platform.',
    cause: 'The platform got used — web components landed, and the team moved on to Lit.',
  },
  {
    repo: 'angular/protractor', name: 'Protractor', born: 2013, died: 2023, stars: 8700, status: 'dead',
    epitaph: 'End-to-end testing for Angular.',
    cause: 'Officially deprecated by the Angular team; Cypress and Playwright divided the estate.',
  },
  {
    repo: 'karma-runner/karma', name: 'Karma', born: 2012, died: 2023, stars: 11900, status: 'dead',
    epitaph: 'Spectacular test runner for JavaScript. Born "Testacular".',
    cause: 'Deprecated in 2023; modern browsers and test runners made it redundant.',
  },
  {
    repo: 'tj/co', name: 'co', born: 2013, died: 2016, stars: 11800, status: 'dead',
    epitaph: 'Generator-based control flow goodness.',
    cause: 'async/await shipped in the language itself. The polyfill became the past.',
  },
  {
    repo: 'requirejs/requirejs', name: 'RequireJS', born: 2010, died: 2018, stars: 12900, status: 'dead',
    epitaph: 'A file and module loader for JavaScript.',
    cause: 'ES modules landed in browsers and AMD became a memory.',
  },
  {
    repo: 'Famous/famous', name: 'Famo.us', born: 2014, died: 2015, stars: 6900, status: 'dead',
    epitaph: 'JavaScript at 60fps, they promised.',
    cause: 'The startup burned through its funding and pivoted; the framework was orphaned overnight.',
  },
  {
    repo: 'facebookarchive/nuclide', name: 'Nuclide', born: 2015, died: 2018, stars: 7700, status: 'dead',
    epitaph: 'A unified IDE, built on Atom.',
    cause: 'Facebook retired it and embraced VS Code. Built on Atom — the grave next door.',
  },
  {
    repo: 'microsoft/CNTK', name: 'CNTK', born: 2016, died: 2019, stars: 17500, status: 'dead',
    epitaph: 'Microsoft Cognitive Toolkit.',
    cause: 'Lost the deep learning framework wars to TensorFlow and PyTorch.',
  },
  {
    repo: 'Theano/Theano', name: 'Theano', born: 2008, died: 2017, stars: 9900, status: 'dead',
    epitaph: 'The grandparent of deep learning frameworks.',
    cause: 'MILA ended development in 2017 — the field it created outgrew it.',
  },
  {
    repo: 'BVLC/caffe', name: 'Caffe', born: 2013, died: 2018, stars: 34000, status: 'dead',
    epitaph: 'Convolutional architecture for fast feature embedding.',
    cause: 'Succeeded by Caffe2, which was itself absorbed into PyTorch.',
  },
  {
    repo: 'tensorflow/swift', name: 'Swift for TensorFlow', born: 2018, died: 2021, stars: 6100, status: 'dead',
    epitaph: 'Differentiable programming in Swift.',
    cause: 'Google ended the experiment in 2021. Beautiful idea, no adoption.',
  },
  {
    repo: 'rkt/rkt', name: 'rkt', born: 2014, died: 2020, stars: 8800, status: 'dead',
    epitaph: 'A security-minded container runtime.',
    cause: 'Docker and containerd won; CoreOS was acquired and the pod was sealed.',
  },
  {
    repo: 'coreos/fleet', name: 'fleet', born: 2014, died: 2018, stars: 2500, status: 'dead',
    epitaph: 'A distributed init system.',
    cause: 'Deprecated, in its maintainers’ own words, in favor of Kubernetes.',
  },
  {
    repo: 'rethinkdb/rethinkdb', name: 'RethinkDB', born: 2009, died: null, stars: 26800, status: 'undead',
    epitaph: 'The database for the realtime web.',
    cause: 'The company shut down in 2016; the community keeps the database breathing.',
  },
  {
    repo: 'knockout/knockout', name: 'Knockout', born: 2010, died: null, stars: 10500, status: 'undead',
    epitaph: 'MVVM for JavaScript.',
    cause: 'MVVM lost to the virtual DOM. Maintenance continues, quietly.',
  },
  {
    repo: 'jashkenas/backbone', name: 'Backbone.js', born: 2010, died: null, stars: 28000, status: 'undead',
    epitaph: 'Give your JS app some backbone.',
    cause: 'React and friends rebuilt the skeleton. Still maintained, out of respect.',
  },
  {
    repo: 'firebug/firebug', name: 'Firebug', born: 2006, died: 2017, stars: 3200, status: 'dead',
    epitaph: 'The tool that taught the web to inspect itself.',
    cause: 'Absorbed into Firefox DevTools. A merger, not a murder.',
  },
  {
    repo: 'flightjs/flight', name: 'Flight', born: 2013, died: 2018, stars: 6500, status: 'dead',
    epitaph: 'An event-driven web framework, from Twitter.',
    cause: 'The component era arrived and Twitter itself moved to React.',
  },
  {
    repo: 'mootools/mootools-core', name: 'MooTools', born: 2006, died: 2016, stars: 2600, status: 'dead',
    epitaph: 'A compact, modular JavaScript framework.',
    cause: 'The browsers standardized; the toolkit dissolved into the platform it improved.',
  },
  {
    repo: 'prototypejs/prototype', name: 'Prototype.js', born: 2005, died: 2015, stars: 1300, status: 'dead',
    epitaph: 'It made JavaScript bearable in 2005.',
    cause: 'Native JavaScript caught up, and Rails — its great patron — dropped it.',
  },
  {
    repo: 'gruntjs/grunt', name: 'Grunt', born: 2012, died: null, stars: 12200, status: 'undead',
    epitaph: 'The JavaScript task runner.',
    cause: 'Gulp took a bite, then webpack, then npm scripts. It never officially died.',
  },
  {
    repo: 'LightTable/LightTable', name: 'Light Table', born: 2012, died: 2019, stars: 11900, status: 'dead',
    epitaph: 'The next generation code editor, crowdfunded with dreams.',
    cause: 'The Kickstarter money ran out long before the vision did.',
  },
  {
    repo: 'jashkenas/coffeescript', name: 'CoffeeScript', born: 2009, died: null, stars: 16500, status: 'undead',
    epitaph: 'It’s just JavaScript — but prettier.',
    cause: 'ES2015 adopted its best ideas. Killed by its own success, technically alive.',
  },
];
