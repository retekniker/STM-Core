const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const bootstrap = path.resolve(__dirname, "..", "install.sh");
const version = "v1.2.3";
const releaseNumber = version.slice(1);
const packageRoot = `STM-Core-${releaseNumber}-linux-x64`;
const archiveName = `${packageRoot}.tar.gz`;
const checksumName = `${archiveName}.sha256`;
const linuxTest = process.platform === "linux" ? test : test.skip;

function writeExecutable(file, content) {
    fs.writeFileSync(file, content, { mode: 0o755 });
}

function createHarness(options = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stm-bootstrap-test-"));
    const fixtures = path.join(root, "fixtures");
    const source = path.join(root, "source");
    const mockBin = path.join(root, "bin");
    const temporaryRoot = path.join(root, "temporary");
    const home = path.join(root, "home");
    const marker = path.join(root, "delegated");
    const curlLog = path.join(root, "curl.log");
    const tarLog = path.join(root, "tar.log");
    fs.mkdirSync(fixtures);
    fs.mkdirSync(source);
    fs.mkdirSync(mockBin);
    fs.mkdirSync(temporaryRoot);
    fs.mkdirSync(home);

    const packageDirectory = path.join(source, packageRoot);
    fs.mkdirSync(path.join(packageDirectory, "app", "runtime", "bin"), { recursive: true });
    writeExecutable(
        path.join(packageDirectory, "install.sh"),
        `#!/usr/bin/env bash\nprintf 'delegated' > "$TEST_MARKER"\n`
    );
    writeExecutable(path.join(packageDirectory, "app", "runtime", "bin", "node"), "#!/usr/bin/env bash\nexit 0\n");

    if (options.missingInstaller) {
        fs.rmSync(path.join(packageDirectory, "install.sh"));
    }
    if (options.missingRuntime) {
        fs.rmSync(path.join(packageDirectory, "app", "runtime", "bin", "node"));
    }
    if (options.unsafeLink) {
        fs.symlinkSync("../../outside", path.join(packageDirectory, "escape"));
    }
    if (options.unsupportedEntry) {
        execFileSync("mkfifo", [path.join(packageDirectory, "unsupported.fifo")]);
    }

    const archive = path.join(fixtures, archiveName);
    const tarArguments = ["-czf", archive, "-C", source, packageRoot];
    if (options.parentTraversal) {
        tarArguments.push("--transform", `s|^${packageRoot}|../outside|`);
    }
    if (options.unexpectedRoot) {
        tarArguments.push("--transform", `s|^${packageRoot}|unexpected-root|`);
    }
    if (options.absolutePath) {
        tarArguments.push("--transform", `s|^${packageRoot}|/absolute-root|`);
    }
    execFileSync("tar", tarArguments, {
        env: { ...process.env, LC_ALL: "C", TAR_OPTIONS: "" }
    });

    if (options.corruptArchive) {
        const archiveSize = fs.statSync(archive).size;
        fs.truncateSync(archive, Math.max(1, Math.floor(archiveSize / 2)));
    }

    const digest = execFileSync("sha256sum", [archive], { encoding: "utf8" }).split(/\s+/)[0];
    const checksumArchiveName = options.wrongChecksumName ? `wrong-${archiveName}` : archiveName;
    const checksumDigest = options.badChecksum ? "0".repeat(64) : digest;
    fs.writeFileSync(path.join(fixtures, checksumName), `${checksumDigest}  ${checksumArchiveName}\n`);
    if (options.missingArchive) {
        fs.rmSync(archive);
    }
    if (options.missingChecksum) {
        fs.rmSync(path.join(fixtures, checksumName));
    }

    writeExecutable(
        path.join(mockBin, "curl"),
        `#!/usr/bin/env bash
set -euo pipefail
output=""
write_url=false
url=""
while (($#)); do
    case "$1" in
        -o) output="$2"; shift 2 ;;
        -w) write_url=true; shift 2 ;;
        -*) shift ;;
        *) url="$1"; shift ;;
    esac
done
printf '%s\n' "$url" >> "$CURL_LOG"
if [[ "$url" == */releases/latest ]]; then
    $write_url && printf '%s' "${options.latestUrl || `https://github.com/retekniker/STM-Core/releases/tag/${options.latestVersion || version}`}"
    exit 0
fi
source_file="$FIXTURE_DIR/\${url##*/}"
[[ -f "$source_file" ]] || exit 22
cp "$source_file" "$output"
`
    );
    const realTar = execFileSync("bash", ["-c", "command -v tar"], { encoding: "utf8" }).trim();
    writeExecutable(
        path.join(mockBin, "tar"),
        `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TAR_LOG"
exec "$REAL_TAR" "$@"
`
    );

    const env = {
        ...process.env,
        PATH: `${mockBin}:${process.env.PATH}`,
        FIXTURE_DIR: fixtures,
        CURL_LOG: curlLog,
        TAR_LOG: tarLog,
        REAL_TAR: realTar,
        HOME: home,
        TMPDIR: temporaryRoot,
        TEST_MARKER: marker
    };

    return {
        root,
        marker,
        curlLog,
        tarLog,
        temporaryRoot,
        run(args = []) {
            return spawnSync("bash", [bootstrap, ...args], { encoding: "utf8", env });
        },
        cleanup() {
            fs.rmSync(root, { recursive: true, force: true });
        }
    };
}

function withHarness(options, callback) {
    const harness = createHarness(options);
    try {
        callback(harness);
    } finally {
        harness.cleanup();
    }
}

function assertRejectedBeforeDelegation(options, pattern) {
    withHarness(options, (harness) => {
        const result = harness.run(["--version", version]);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, pattern);
        assert.equal(fs.existsSync(harness.marker), false);
        assert.deepEqual(fs.readdirSync(harness.temporaryRoot), []);
    });
}

linuxTest("explicit stable version verifies and delegates, then cleans temporary files", () => {
    withHarness({}, (harness) => {
        const result = harness.run(["--version", version]);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.readFileSync(harness.marker, "utf8"), "delegated");
        assert.match(fs.readFileSync(harness.curlLog, "utf8"), /releases\/download\/v1\.2\.3\/STM-Core-1\.2\.3-linux-x64\.tar\.gz/);
        assert.deepEqual(fs.readdirSync(harness.temporaryRoot), []);
    });
});

linuxTest("no arguments resolves the latest stable release and delegates", () => {
    withHarness({}, (harness) => {
        const result = harness.run();
        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.readFileSync(harness.marker, "utf8"), "delegated");
    });
});

linuxTest("latest resolution rejects a non-stable tag before downloading assets", () => {
    withHarness({ latestVersion: "v1.2.3-rc.1" }, (harness) => {
        const result = harness.run();
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /must match vX.Y.Z/);
        assert.equal(fs.existsSync(harness.marker), false);
        assert.equal(fs.readFileSync(harness.curlLog, "utf8").trim().endsWith("/releases/latest"), true);
    });
});

linuxTest("latest resolution rejects redirects outside the exact GitHub release path", () => {
    withHarness({ latestUrl: "https://example.test/releases/tag/v1.2.3" }, (harness) => {
        const result = harness.run();
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /outside the expected GitHub release path/);
        assert.equal(fs.existsSync(harness.marker), false);
    });
});

linuxTest("malformed arguments and unsupported sources never delegate", () => {
    withHarness({}, (harness) => {
        for (const args of [
            ["--version"],
            ["--version", "main"],
            ["--version", "abcdef1"],
            ["--version", "https://example.test/v1.2.3"],
            ["--version", "v1.2"],
            ["--branch", "main"],
            ["--version", version, "extra"]
        ]) {
            const result = harness.run(args);
            assert.notEqual(result.status, 0, args.join(" "));
            assert.equal(fs.existsSync(harness.marker), false);
        }
    });
});

linuxTest("missing release assets never delegate", () => {
    assertRejectedBeforeDelegation({ missingArchive: true }, /could not download/);
    assertRejectedBeforeDelegation({ missingChecksum: true }, /could not download/);
});

linuxTest("checksum filename and digest must match before delegation", () => {
    assertRejectedBeforeDelegation({ wrongChecksumName: true }, /does not name/);
    assertRejectedBeforeDelegation({ badChecksum: true }, /SHA-256 verification failed/);
});

linuxTest("unsafe parent paths and escaping links are rejected before extraction", () => {
    assertRejectedBeforeDelegation({ parentTraversal: true }, /unsafe or unexpected path/);
    assertRejectedBeforeDelegation({ absolutePath: true }, /unsafe or unexpected path/);
    assertRejectedBeforeDelegation({ unexpectedRoot: true }, /unsafe or unexpected path/);
    assertRejectedBeforeDelegation({ unsafeLink: true }, /link escapes/);
});

linuxTest("a checksum-valid corrupted archive fails inspection before delegation", () => {
    withHarness({ corruptArchive: true }, (harness) => {
        const result = harness.run(["--version", version]);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /could not inspect archive contents/);
        assert.equal(fs.existsSync(harness.marker), false);
        assert.doesNotMatch(fs.readFileSync(harness.tarLog, "utf8"), /-xzf/);
    });
});

linuxTest("unsupported archive entry types are rejected before delegation", () => {
    withHarness({ unsupportedEntry: true }, (harness) => {
        const result = harness.run(["--version", version]);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /unsupported entry type/);
        assert.equal(fs.existsSync(harness.marker), false);
        assert.doesNotMatch(fs.readFileSync(harness.tarLog, "utf8"), /-xzf/);
    });
});

linuxTest("required installer and bundled runtime must be present", () => {
    assertRejectedBeforeDelegation({ missingInstaller: true }, /missing its top-level install/);
    assertRejectedBeforeDelegation({ missingRuntime: true }, /missing its executable bundled Node/);
});
