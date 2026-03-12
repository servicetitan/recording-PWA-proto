const { execSync, spawnSync } = require('child_process');

if (checkNpm()) {
    run('npm', ['i', '--no-audit', '--legacy-peer-deps']);
} else {
    console.log(
        '\x1b[31m%s\x1b[0m',
        "Heads up! Your version of npm is outdated. Package installation is using npx to run npm v7, but you can install it directly by running 'npm i npm@7 -g' to make the process faster next time! \n"
    );
    run('npx', [
        '--cache',
        '"./node_modules/.npx-cache/"',
        'npm@7',
        'i',
        '--no-audit',
        '--legacy-peer-deps',
    ]);
}

function checkNpm() {
    try {
        const v = execSync('npm -v', { timeout: 10000 });

        if (v == null) {
            return false;
        }

        return v.toString().split('.')[0] >= 7;
    } catch (e) {
        return false;
    }
}

function run(command, args) {
    const { error, status } = spawnSync(command, args, { stdio: 'inherit', shell: true });

    if (error || status !== 0) {
        process.exitCode = status || 1;

        if (error) {
            throw error;
        }
    }
}
