data "scaleway_instance_server" "laed_base" {
  server_id = var.laed_base_instance_id
  zone      = var.base_zone
}
