output "gpu_instance_id" {
  value = scaleway_instance_server.gpu.id
}

output "gpu_private_ip" {
  value = scaleway_instance_server.gpu.private_ips[0]
}

output "models_bucket_name" {
  value = scaleway_object_bucket.models.name
}

output "models_bucket_endpoint" {
  value = "https://${scaleway_object_bucket.models.name}.s3.${var.region}.scw.cloud"
}
