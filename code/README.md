# EasyLang

EasyLang is a small project that converts an English-like mini language into Java. It includes:

- A TypeScript-based converter (tokenizer, parser, generator)
- A minimal browser extension scaffold that can run the converter in-page
- Examples and documentation

Quick start

1. Install dependencies:

```bash
npm install
```

2. Build the converter:

```bash
npm run build
```

3. Run the CLI converter on the example:

```bash
npm start
```

4. For extension development: open your browser's extensions page and "Load unpacked" pointing to the `extension/` folder. Press `Ctrl+Shift+J` in a text area containing an EasyLang block to see conversion (demo behavior).
