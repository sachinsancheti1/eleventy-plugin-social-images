#!/usr/bin/env node

const argv = require("yargs-parser")(process.argv.slice(2));
const chromium = require("chrome-aws-lambda");
const fs = require("fs");
const path = require("path");
const isWsl = require("is-wsl");
const delay = require("delay");

const defaults = {
  siteName: "11ty Rocks!",
  outputDir: "_site",
  imageDir: "previews",
  dataFile: "pages.json",
  templatePath: "", // ex. social/template.html
  stylesPath: "", // ex. social/style.css,
  theme: "blue", // enum: 'blue' | 'green' | 'minimal' | 'sunset' | 'pop'
  width: 600,
  height: 315,
  deviceScaleFactor: 2,
};

const {
  siteName,
  outputDir,
  imageDir,
  dataFile,
  templatePath,
  stylesPath,
  theme,
  width,
  height,
  deviceScaleFactor,
} = {
  ...defaults,
  ...argv,
};

const buildRoot = fs.realpathSync(outputDir);

const templateSrc = templatePath.length
  ? fs.realpathSync(templatePath)
  : "../files/template.html";

const styleSrc = stylesPath.length
  ? fs.realpathSync(stylesPath)
  : "../files/style.css";

const previewPath = `${buildRoot}/${imageDir}`;

const dataPath = fs.realpathSync(dataFile);

(async () => {
  console.log("Starting custom social images...");

  const browserArgs = {
    args: chromium.args,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  };

  // WSL requires a different config
  if (isWsl) {
    browserArgs.executablePath = "google-chrome";
    browserArgs.headless = true;
  }

if (process.env.CONTEXT === 'production') {
  console.log("Social Images being processed as this is the production branch");
    const browser = await chromium.puppeteer.launch(browserArgs);

  const page = await browser.newPage();

  // Load html from template
  let html = path.resolve(__dirname, templateSrc);
  if (!fs.existsSync(html)) {
    console.log("Invalid templatePath provided");
    process.exit(1);
  }
  html = fs.readFileSync(html).toString().replace("{{ siteName }}", siteName);

  // Load CSS styles if no custom template provided
  let css = path.resolve(__dirname, styleSrc);
  if (!fs.existsSync(css)) {
    console.log("Invalid stylesPath provided");
    process.exit(1);
  }
  css = fs.readFileSync(css).toString();

  html = html
    .replace("{{ style }}", css)
    .replace('class="blue"', `class="${theme}"`);

  // Get generated data json
  let data = path.resolve(__dirname, dataPath);
  if (!fs.existsSync(data)) {
    console.log("Invalid dataFile location or file name provided");
    process.exit(1);
  }
  const pages = require(data);

  // Render html, wait for 0 network connections to ensure webfonts downloaded
  await page.setContent(html, {
    waitUntil: ["networkidle0"],
  });

  // Wait until the document is fully rendered
  await page.evaluateHandle("document.fonts.ready");

  // Set the viewport to your preferred image size
  await page.setViewport({
    width,
    height,
    deviceScaleFactor,
  });

  // Create a `previews` directory in the public folder
  const dir = path.resolve(__dirname, previewPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  // Go over all the posts
  for (const post of pages) {
    // Update the H1 element with the post title
    /*console.log(post.title);
    console.log(post.cover);
    console.log(post.bhkSpecs);*/
    await page.evaluate((post) => {
      const title = document.querySelector("h1");
      title.innerHTML = post.title;
      const main = document.querySelector("main");
      main.style.backgroundImage = `url(${post.cover})`;
      const element = document.querySelector(".flexgrid");
      var flexgrid = element ? element : "";
      if (flexgrid !== "") {
        flexgrid.innerHTML = "";
        for (feat in post.bhkSpecs) {
          var feature = document.createElement("div");
          feature.classList.add("hfeature", "nogrow");
          const s = post.bhkSpecs[feat];
          console.log();
          s.unit = s.unit !== undefined ? s.unit : "";
          s.size = s.size !== undefined ? s.size : "";
          s.key = s.key !== undefined ? s.key : "";
          feature.innerHTML = `
        <div class="circle pro-icon">
        <img alt="" src="${s.icon}" width="60px" height="60px">
        </div>
        <div class="pro-size">${s.size} <span class="pro-unit">${s.unit}</span></div>
       `;
          flexgrid.appendChild(feature);
        }
      }
    }, post);

    await delay(10000);

    console.log(`Image: ${post.imgName}.png`);

    // Save a screenshot to [outputDir]/[previewDir]/[imgName].png
    await page.screenshot({
      path: `${dir}/${post.imgName}.png`,
      type: "png",
      clip: { x: 0, y: 0, width, height },
    });
  }

  // close all pages, fix perm issues on windows 10 (https://github.com/puppeteer/puppeteer/issues/298)
  let browserPages = await browser.pages();
  await Promise.all(browserPages.map((page) => page.close()));

  await browser.close();
}
  console.log("Social images complete!");
})();
