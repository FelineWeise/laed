resource "scaleway_block_volume" "models" {
  name       = "laed-gpu-models"
  iops       = 5000
  size_in_gb = 80
  zone       = var.zone

  lifecycle {
    prevent_destroy = true
  }
}

resource "scaleway_object_bucket" "models" {
  name   = "laed-models-${var.environment}"
  region = var.region

  versioning {
    enabled = true
  }
}

resource "scaleway_object_bucket_policy" "models" {
  bucket = scaleway_object_bucket.models.id
  policy = jsonencode({
    Version = "2023-04-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource = [
        scaleway_object_bucket.models.name,
        "${scaleway_object_bucket.models.name}/*"
      ]
      Condition = {
        Bool = {
          "aws:SecureTransport" = "false"
        }
      }
    }]
  })
}
