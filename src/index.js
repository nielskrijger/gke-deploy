#!/usr/bin/env node

const chalk = require('chalk');
const bluebird = require('bluebird');
const spawn = require('child_process').spawn;
const exec = bluebird.promisify(require('child_process').exec);
const readFile = bluebird.promisify(require('fs').readFile);
const argv = require('yargs')
  .usage('$0 <cmd> [args]')
  .command('kubeconfig', 'updates kubeconfig with `.gkedeploy` settings')
  .command('push', 'builds docker image and pushes it to Google Container Registry')
  .command('deploy', 'deploys docker image to Google Container Engine')
  .demandCommand(1, 'You need to specify at least one command')
  .recommendCommands()
  .option('c', {
    alias: 'config',
    default: '.gkedeploy',
    describe: 'configuration file',
  })
  .global('c')
  .help()
  .argv;

/**
 * Executes command and streams output to console.
 */
function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const cmd = spawn(command, args, options);
    cmd.stdout.on('data', (data) => {
      console.log(chalk.gray(data.toString().trim()));
    });

    // Annoyingly gcloud considerd stderr "Status messages about the action you are performing."
    // Source: https://code.google.com/p/google-cloud-sdk/issues/detail?id=487
    // In other words, those google --beep-- dump perfectly fine output to stderr.
    cmd.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (command === 'gcloud') {
        if (text.startsWith('ERROR')) {
          console.log(chalk.red(text));
        } else {
          console.log(chalk.gray(text));
        }
      } else {
        console.log(chalk.red(text));
      }
    });

    cmd.on('exit', (code) => {
      if (code !== 0) {
        process.exit(1);
      }
      resolve();
    });

    cmd.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Attempts to locate .gkedeploy file.
 */
function getConfig(filepath) {
  return readFile(filepath, { encoding: 'UTF-8' }).then((fileContents) => {
    const cfg = JSON.parse(fileContents);
    if (!cfg.gcr_host) throw new Error('Config file must specify "gcr_host" (e.g. "us.gcr.io")');
    if (!cfg.project_id) throw new Error('Config file must specify "project_id" (can be found in google console)');
    if (!cfg.deployment_name) throw new Error('Config file must specify "deployment_name" (can be found in google console)');
    if (!cfg.cluster_name) throw new Error('Config file must specify "cluster_name" (can be found in google console)');
    if (!cfg.cluster_zone) throw new Error('Config file must specify "cluster_zone" (e.g. "us-east1-d")');
    return cfg;
  });
}

/**
 * Retrieves git commit (short) hash and branch name. Example output:
 *
 * ```
 * { commit: 'a5cb4a3', branch: 'master' }
 * ```
 */
function getGitCommit() {
  return exec('git rev-parse --short HEAD').then((commit) => {
    return exec('git symbolic-ref --short HEAD').then((branch) => {
      return {
        commit: commit.trim(),
        branch: branch.trim(),
      };
    });
  });
}

/**
 * Generates docker tag for new docker build.
 */
function dockerTag(cfg, tag) {
  return `${cfg.gcr_host}/${cfg.project_id}/${cfg.deployment_name}:${tag}`;
}

/**
 * Builds docker image
 */
function dockerBuild(tag) {
  console.log(chalk.cyan(`Build image ${tag}`));
  return execute('docker', ['build', '-t', tag, '.']);
}

/**
 * Pushes docker image to Google Container Registry.
 */
function dockerPush(tag) {
  console.log(chalk.cyan(`Pushing image ${tag}`));
  return execute('gcloud', ['docker', '--', 'push', tag]);
}

/**
 * Adds additional tag to container.
 */
function dockerAddTag(currentTag, newTag) {
  console.log(chalk.cyan(`Add tag ${newTag} to ${currentTag}`));
  // Weirdly gcloud add-tag adds normal output to stderr, so don't colorize errors
  return execute('gcloud', [
    'beta',
    'container',
    'images',
    'add-tag',
    currentTag,
    newTag,
    '-q',
  ]);
}

/**
 * Prints error to console and exits process.
 */
function processError(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  };
}

/**
 * Builds docker container and pushes it to Google Container Registry.
 */
function push(opts) {
  if (argv._.includes('push')) {
    return dockerBuild(opts.tag).then(() => {
      return dockerPush(opts.tag);
    }).then(() => {
      return dockerAddTag(opts.tag, dockerTag(opts.config, 'latest'));
    }).then(() => {
      return dockerAddTag(opts.tag, dockerTag(opts.config, opts.branch));
    }).then(() => {
      console.log(chalk.cyan(`Finished uploading image ${opts.tag}`));
    });
  }
  return Promise.resolve();
}

/**
 * Updates kubernetes image with new deployment.
 */
function kubeDeploy(opts) {
  console.log(chalk.cyan(`Update deployment/${opts.config.deployment_name} with new image ${opts.tag}`));
  return execute('kubectl', [
    'set',
    'image',
    `deployment/${opts.config.deployment_name}`,
    `${opts.config.deployment_name}=${opts.tag}`,
  ]).then(() => {
    console.log(chalk.gray('Watching deployment...'));
    return execute('kubectl', [
      'rollout',
      'status',
      `deployment/${opts.config.deployment_name}`,
    ]);
  }).then(() => {
    console.log(chalk.cyan('Finished deployment, you should manually verify your'
      + ' deployment because usually deployment failure conditions are configured improperly'));
  });
}

/**
 * Initializes kubeconfig.
 */
function kubeconfig(opts) {
  if (argv._.includes('kubeconfig') || argv._.includes('deploy')) {
    console.log(chalk.cyan(`Init kubeconfig using ${argv.config} settings`));
    return execute('gcloud', [
      'container',
      'clusters',
      'get-credentials',
      opts.config.cluster_name,
      '--zone', opts.config.cluster_zone,
      '--project', opts.config.project_id,
    ]);
  }
  return Promise.resolve();
}

/**
 * Executes kubernetes deploy if defined.
 */
function deploy(opts) {
  if (argv._.includes('deploy')) {
    return kubeDeploy(opts);
  }
  return Promise.resolve();
}

/**
 * Executes script.
 */
function cli() {
  const opts = {};
  getConfig(argv.config).then((config) => {
    opts.config = config;
    return getGitCommit();
  }).then(({ commit, branch }) => {
    Object.assign(opts, { tag: dockerTag(opts.config, commit), commit, branch });
    return push(opts);
  }).then(() => {
    return kubeconfig(opts);
  }).then(() => {
    return deploy(opts);
  }).then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error(chalk.red(err));
    process.exit(1);
  });
}

cli();
