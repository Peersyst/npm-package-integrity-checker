const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

// Colors for console output
const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    bold: "\x1b[1m",
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function logHeader(packageName) {
    console.log("\n" + "=".repeat(60));
    log(`📦 Checking: ${packageName}`, colors.bold + colors.cyan);
    console.log("=".repeat(60));
}

function logStep(step, message) {
    log(`  [${step}] ${message}`, colors.blue);
}

function logSuccess(message) {
    log(`  ✅ ${message}`, colors.green);
}

function logError(message) {
    log(`  ❌ ${message}`, colors.red);
}

function logWarning(message) {
    log(`  ⚠️  ${message}`, colors.yellow);
}

/**
 * Check if a file matches any of the ignore patterns
 * Supports simple glob patterns like *.js.map, tsconfig.tsbuildinfo
 */
function shouldIgnore(filePath, ignorePatterns = []) {
    const fileName = path.basename(filePath);

    for (const pattern of ignorePatterns) {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\./g, "\\.") // Escape dots
            .replace(/\*/g, ".*"); // Convert * to .*

        const regex = new RegExp(`^${regexPattern}$`);

        // Check against full path and file name
        if (regex.test(filePath) || regex.test(fileName)) {
            return true;
        }
    }

    return false;
}

/**
 * Calculate SHA256 checksum of a file
 */
function getFileChecksum(filePath) {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Get all files in a directory recursively
 */
function getFilesRecursively(dir, baseDir = dir, ignorePatterns = []) {
    const files = [];

    if (!fs.existsSync(dir)) {
        return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        // Skip node_modules folder inside packages
        if (entry.name === "node_modules") {
            continue;
        }

        // Skip ignored files
        if (shouldIgnore(relativePath, ignorePatterns)) {
            continue;
        }

        if (entry.isDirectory()) {
            files.push(...getFilesRecursively(fullPath, baseDir, ignorePatterns));
        } else {
            files.push(relativePath);
        }
    }

    return files.sort();
}

/**
 * Generate a checksum for an entire directory
 * Returns an object with individual file checksums and a combined checksum
 */
function getDirectoryChecksum(dir, ignorePatterns = []) {
    const files = getFilesRecursively(dir, dir, ignorePatterns);
    const checksums = {};

    for (const file of files) {
        const filePath = path.join(dir, file);
        checksums[file] = getFileChecksum(filePath);
    }

    // Create a combined checksum from all files
    const combinedString = files.map((f) => `${f}:${checksums[f]}`).join("\n");
    const combinedChecksum = crypto
        .createHash("sha256")
        .update(combinedString)
        .digest("hex");

    return {
        files: checksums,
        combined: combinedChecksum,
        fileList: files,
    };
}

/**
 * Read and parse a JSON file
 */
function readJSON(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * Check a single package
 */
function checkPackage(packageName, config, rootDir) {
    logHeader(packageName);

    const { path: packagePath, dist, buildScript, ignore = [] } = config;
    const fullPackagePath = path.join(rootDir, packagePath);
    const distPath = path.join(fullPackagePath, dist);
    const nodeModulesPath = path.join(rootDir, "node_modules", packageName);

    let success = true;
    const errors = [];

    // Step 1: Check version match
    logStep("1/4", "Checking version match...");

    const sourcePackageJson = path.join(fullPackagePath, "package.json");
    const nodeModulesPackageJson = path.join(nodeModulesPath, "package.json");

    if (!fs.existsSync(sourcePackageJson)) {
        logError(`Source package.json not found: ${sourcePackageJson}`);
        return { success: false, errors: ["Source package.json not found"] };
    }

    if (!fs.existsSync(nodeModulesPackageJson)) {
        logError(
            `node_modules package.json not found: ${nodeModulesPackageJson}`
        );
        return {
            success: false,
            errors: ["node_modules package.json not found"],
        };
    }

    const sourceVersion = readJSON(sourcePackageJson).version;
    const installedVersion = readJSON(nodeModulesPackageJson).version;

    if (sourceVersion !== installedVersion) {
        logError(
            `Version mismatch! Source: ${sourceVersion}, Installed: ${installedVersion}`
        );
        logWarning(
            `Please update the source code to version ${installedVersion}`
        );
        errors.push(
            `Version mismatch: ${sourceVersion} vs ${installedVersion}`
        );
        success = false;
    } else {
        logSuccess(`Version match: ${sourceVersion}`);
    }

    // Step 2: Build the package
    logStep("2/4", "Building package...");

    try {
        execSync(buildScript, {
            cwd: fullPackagePath,
            stdio: "pipe",
            encoding: "utf8",
        });
        logSuccess("Build completed successfully");
    } catch (error) {
        logError(`Build failed: ${error.message}`);
        errors.push("Build failed");
        return { success: false, errors };
    }

    // Step 3: Generate checksums
    logStep("3/4", "Generating checksums...");

    if (!fs.existsSync(distPath)) {
        logError(`Dist folder not found after build: ${distPath}`);
        errors.push("Dist folder not created");
        return { success: false, errors };
    }

    const sourceChecksum = getDirectoryChecksum(distPath, ignore);
    const installedChecksum = getDirectoryChecksum(nodeModulesPath, ignore);

    log(`     Source dist checksum: ${sourceChecksum.combined}`, colors.cyan);
    log(
        `     Installed checksum:   ${installedChecksum.combined}`,
        colors.cyan
    );

    // Step 4: Compare checksums
    logStep("4/4", "Comparing checksums...");

    // Compare file lists
    const sourceFiles = new Set(sourceChecksum.fileList);
    const installedFiles = new Set(installedChecksum.fileList);

    const missingInInstalled = [...sourceFiles].filter(
        (f) => !installedFiles.has(f)
    );
    const extraInInstalled = [...installedFiles].filter(
        (f) => !sourceFiles.has(f)
    );

    if (missingInInstalled.length > 0) {
        logWarning(
            `Files in source but not in installed: ${missingInInstalled.join(
                ", "
            )}`
        );
    }

    if (extraInInstalled.length > 0) {
        logWarning(
            `Files in installed but not in source: ${extraInInstalled.join(
                ", "
            )}`
        );
    }

    // Compare individual file checksums
    const commonFiles = [...sourceFiles].filter((f) => installedFiles.has(f));
    const mismatchedFiles = [];

    for (const file of commonFiles) {
        if (sourceChecksum.files[file] !== installedChecksum.files[file]) {
            mismatchedFiles.push(file);
        }
    }

    if (mismatchedFiles.length > 0) {
        logError(`Checksum mismatch for files: ${mismatchedFiles.join(", ")}`);
        errors.push(`Checksum mismatch: ${mismatchedFiles.join(", ")}`);
        success = false;
    }

    if (sourceChecksum.combined === installedChecksum.combined) {
        logSuccess("All checksums match! Package integrity verified ✓");
    } else if (
        mismatchedFiles.length === 0 &&
        missingInInstalled.length === 0
    ) {
        // Files match but there are extra files in installed (like package.json modifications)
        logWarning(
            "File contents match, but installed package has additional files"
        );
        log(
            "     This is usually expected (npm may add metadata)",
            colors.yellow
        );
    } else {
        logError("Checksums do not match - package may have been modified!");
        success = false;
    }

    return { success, errors };
}

/**
 * Main function
 */
function main() {
    const rootDir = process.cwd();
    const configPath = path.join(rootDir, "config.json");

    log("\n🔍 Package Integrity Check", colors.bold + colors.green);
    log("━".repeat(60), colors.green);

    if (!fs.existsSync(configPath)) {
        logError("config.json not found!");
        process.exit(1);
    }

    const builds = readJSON(configPath);
    const results = {};

    for (const [packageName, config] of Object.entries(builds)) {
        results[packageName] = checkPackage(packageName, config, rootDir);
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    log("📊 Summary", colors.bold + colors.cyan);
    console.log("=".repeat(60));

    let allPassed = true;

    for (const [packageName, result] of Object.entries(results)) {
        if (result.success) {
            logSuccess(`${packageName}: PASSED`);
        } else {
            logError(`${packageName}: FAILED`);
            for (const error of result.errors) {
                log(`      - ${error}`, colors.red);
            }
            allPassed = false;
        }
    }

    console.log("\n" + "━".repeat(60));

    if (allPassed) {
        log(
            "🎉 All packages passed integrity check!",
            colors.bold + colors.green
        );
        process.exit(0);
    } else {
        log(
            "💥 Some packages failed integrity check!",
            colors.bold + colors.red
        );
        process.exit(1);
    }
}

main();
