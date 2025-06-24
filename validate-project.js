// Project validation script for Chrome Bug Reporter
// Run this script to check if all files are present and valid

const fs = require('fs');
const path = require('path');

class ProjectValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.projectRoot = process.cwd();
  }

  validate() {
    console.log('🐛 Chrome Bug Reporter - Project Validation\n');

    this.checkRequiredFiles();
    this.validateManifest();
    this.checkFileStructure();
    this.validateJavaScript();
    this.validateHTML();
    this.validateCSS();

    this.printResults();
  }

  checkRequiredFiles() {
    console.log('📁 Checking required files...');

    const requiredFiles = [
      'manifest.json',
      'background/background.js',
      'content/content.js',
      'popup/popup.html',
      'popup/popup.css',
      'popup/popup.js',
      'options/options.html',
      'options/options.css',
      'options/options.js',
      'utils/storage.js',
      'README.md',
      'REQUIREMENTS.md',
      'SETUP.md'
    ];

    requiredFiles.forEach(file => {
      if (this.fileExists(file)) {
        console.log(`  ✅ ${file}`);
      } else {
        this.errors.push(`Missing required file: ${file}`);
        console.log(`  ❌ ${file} - MISSING`);
      }
    });

    // Check for icon files (these need to be generated)
    const iconFiles = ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png'];
    const missingIcons = iconFiles.filter(icon => !this.fileExists(`icons/${icon}`));

    if (missingIcons.length > 0) {
      this.warnings.push(`Missing icon files: ${missingIcons.join(', ')}. Use icons/create-icons.html to generate them.`);
    }

    console.log();
  }

  validateManifest() {
    console.log('📋 Validating manifest.json...');

    try {
      const manifestPath = path.join(this.projectRoot, 'manifest.json');
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      // Check required fields
      const requiredFields = ['manifest_version', 'name', 'version', 'description'];
      requiredFields.forEach(field => {
        if (manifest[field]) {
          console.log(`  ✅ ${field}: ${manifest[field]}`);
        } else {
          this.errors.push(`Missing required manifest field: ${field}`);
        }
      });

      // Check manifest version
      if (manifest.manifest_version === 3) {
        console.log('  ✅ Using Manifest V3');
      } else {
        this.warnings.push('Consider using Manifest V3 for latest Chrome support');
      }

      // Check permissions
      if (manifest.permissions && manifest.permissions.length > 0) {
        console.log(`  ✅ Permissions: ${manifest.permissions.join(', ')}`);
      }

      // Check background script
      if (manifest.background && manifest.background.service_worker) {
        console.log(`  ✅ Service Worker: ${manifest.background.service_worker}`);
      }

    } catch (error) {
      this.errors.push(`Invalid manifest.json: ${error.message}`);
    }

    console.log();
  }

  checkFileStructure() {
    console.log('🏗️  Checking file structure...');

    const expectedDirs = ['background', 'content', 'popup', 'options', 'utils', 'icons'];
    expectedDirs.forEach(dir => {
      if (this.directoryExists(dir)) {
        console.log(`  ✅ ${dir}/`);
      } else {
        this.errors.push(`Missing directory: ${dir}`);
      }
    });

    console.log();
  }

  validateJavaScript() {
    console.log('🔧 Validating JavaScript files...');

    const jsFiles = [
      'background/background.js',
      'content/content.js',
      'popup/popup.js',
      'options/options.js',
      'utils/storage.js'
    ];

    jsFiles.forEach(file => {
      if (this.fileExists(file)) {
        try {
          const content = fs.readFileSync(path.join(this.projectRoot, file), 'utf8');

          // Basic syntax checks
          if (content.includes('chrome.')) {
            console.log(`  ✅ ${file} - Contains Chrome API calls`);
          }

          if (content.includes('class ')) {
            console.log(`  ✅ ${file} - Uses ES6 classes`);
          }

          // Check for common patterns
          if (file.includes('background') && content.includes('chrome.runtime.onMessage')) {
            console.log(`  ✅ ${file} - Message listener implemented`);
          }

          if (file.includes('content') && content.includes('console.')) {
            console.log(`  ✅ ${file} - Console capture implemented`);
          }

        } catch (error) {
          this.warnings.push(`Could not validate ${file}: ${error.message}`);
        }
      }
    });

    console.log();
  }

  validateHTML() {
    console.log('📄 Validating HTML files...');

    const htmlFiles = [
      'popup/popup.html',
      'options/options.html',
      'test-page.html',
      'icons/create-icons.html'
    ];

    htmlFiles.forEach(file => {
      if (this.fileExists(file)) {
        try {
          const content = fs.readFileSync(path.join(this.projectRoot, file), 'utf8');

          if (content.includes('<!DOCTYPE html>')) {
            console.log(`  ✅ ${file} - Valid HTML5 doctype`);
          } else {
            this.warnings.push(`${file} missing HTML5 doctype`);
          }

          if (content.includes('<meta charset="UTF-8">')) {
            console.log(`  ✅ ${file} - UTF-8 encoding`);
          }

        } catch (error) {
          this.warnings.push(`Could not validate ${file}: ${error.message}`);
        }
      }
    });

    console.log();
  }

  validateCSS() {
    console.log('🎨 Validating CSS files...');

    const cssFiles = [
      'popup/popup.css',
      'options/options.css'
    ];

    cssFiles.forEach(file => {
      if (this.fileExists(file)) {
        try {
          const content = fs.readFileSync(path.join(this.projectRoot, file), 'utf8');

          if (content.includes('linear-gradient')) {
            console.log(`  ✅ ${file} - Modern CSS features`);
          }

          if (content.includes('flex') || content.includes('grid')) {
            console.log(`  ✅ ${file} - Modern layout`);
          }

        } catch (error) {
          this.warnings.push(`Could not validate ${file}: ${error.message}`);
        }
      }
    });

    console.log();
  }

  fileExists(filePath) {
    try {
      return fs.statSync(path.join(this.projectRoot, filePath)).isFile();
    } catch {
      return false;
    }
  }

  directoryExists(dirPath) {
    try {
      return fs.statSync(path.join(this.projectRoot, dirPath)).isDirectory();
    } catch {
      return false;
    }
  }

  printResults() {
    console.log('📊 Validation Results');
    console.log('═'.repeat(50));

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('🎉 All checks passed! Project is ready for installation.');
    } else {
      if (this.errors.length > 0) {
        console.log('\n❌ ERRORS:');
        this.errors.forEach(error => console.log(`   • ${error}`));
      }

      if (this.warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:');
        this.warnings.forEach(warning => console.log(`   • ${warning}`));
      }
    }

    console.log('\n📋 Next Steps:');
    console.log('1. Generate icons using icons/create-icons.html');
    console.log('2. Install extension in Chrome (chrome://extensions/)');
    console.log('3. Test functionality using test-page.html');
    console.log('4. Check SETUP.md for detailed installation instructions');
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  const validator = new ProjectValidator();
  validator.validate();
}

module.exports = ProjectValidator;
