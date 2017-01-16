# gke-deploy

This is a utility library to easily build and push docker projects to Google Container Registry (GCR) and deploy them on Google Container Engine (GKE).

This tool relies on the following applications to be installed on your machine or CI:

- `node`
- `npm`
- `git`
- `docker`
- `kubectl`
- `gcloud`

How to install and configure these application is out-of-scope for this document. It is highly recommended to setup a working Google Container Engine cluster with at least one running deployment before using this tool.

This tool only updates the deployment image of an existing kubernetes deployment, it will not create one!

## Installation

```
$ npm install -g gke-deploy
```

## Setup

In your project, in the same directory as your Dockerfile add a `.gkedeploy` file with the following contents:

```json
{
  "gcr_host": "us.gcr.io",
  "project_id": "my-project-id",
  "deployment_name": "my-deployment",
  "cluster_name": "cluster-1",
  "cluster_zone": "us-east1-d"
}
```

These settings can be found in your gcloud console or in kubectl. Pay special attention to the `deployment_name`. A gcloud container deployment MUST exist prior to running `gke-deploy deploy`. Run `kubectl get deployments` to check your existing deployment names.

To build your docker image, push its image to GCR and deploy it run the following:

```
$ gke-deploy push deploy
```

To list all commands and options run:

```
$ gke-deploy --help
```

# TODO

- Login with Gcloud using keyconfig json file
