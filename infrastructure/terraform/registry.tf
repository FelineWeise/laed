resource "scaleway_registry_namespace" "main" {
  name      = var.project_name
  region    = var.scw_region
  is_public = false
}
