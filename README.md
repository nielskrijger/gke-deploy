# gke-deploy

Utility library to easily build and push docker project to Google Container Registry (GCR) and deploy it on Google Container Engine (GKE).

This library relies on the following applications to be installed and available in your CLI:

- `git`
- `docker`
- `kubectl`
- `gcloud`

How to install and configure these application is out-of-scope for this document.

This tool only updates the deployment image of an existing kubernetes deployment, it will not create one. See Google docs how to do this.

## Setup

```
$ npm install -g gke-deploy
```

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

Make sure to add `.gkedeploy` to your `.gitignore` if you want to keep your deployment configuration hidden.

To build your docker image, push its image to GCR and deploy it run the following:

```
$ gke-deploy push deploy
```

To list all commands and options run:

```
$ gke-deploy --help
```
