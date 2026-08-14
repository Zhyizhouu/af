// Package storage adapts SeaweedFS to the convert.Blobs port.
//
// SeaweedFS is spoken to through its S3 gateway rather than its native filer
// API: it is one client library instead of a bespoke one, and it means the
// store can be swapped for R2, B2 or real S3 by changing an endpoint.
package storage

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// ErrNotFound lets the gateway answer 404 without importing the S3 types.
var ErrNotFound = errors.New("object not found")

type Seaweed struct {
	client   *s3.Client
	uploader *manager.Uploader
	bucket   string
}

type Options struct {
	Endpoint  string
	Region    string
	AccessKey string
	SecretKey string
	Bucket    string
}

func NewSeaweed(ctx context.Context, opt Options) (*Seaweed, error) {
	client := s3.New(s3.Options{
		Region:       opt.Region,
		BaseEndpoint: aws.String(opt.Endpoint),
		Credentials: credentials.NewStaticCredentialsProvider(
			opt.AccessKey, opt.SecretKey, ""),

		// SeaweedFS serves buckets as path prefixes, not as subdomains.
		UsePathStyle: true,

		// Recent AWS SDKs add CRC32 integrity headers to every request by
		// default. S3-compatible stores that predate that reject the trailing
		// checksum outright, so ask for them only where the API requires them.
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	})

	s := &Seaweed{
		client:   client,
		uploader: manager.NewUploader(client),
		bucket:   opt.Bucket,
	}
	if err := s.ensureBucket(ctx); err != nil {
		return nil, err
	}
	return s, nil
}

// ensureBucket creates the bucket on first boot so a fresh volume needs no
// manual setup step. Racing another replica is fine — both outcomes are the
// bucket existing.
func (s *Seaweed) ensureBucket(ctx context.Context) error {
	_, err := s.client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: &s.bucket})
	if err == nil {
		return nil
	}

	var owned *types.BucketAlreadyOwnedByYou
	var exists *types.BucketAlreadyExists
	if errors.As(err, &owned) || errors.As(err, &exists) {
		return nil
	}

	// The gateway is allowed to be blunt about this; treat a reachable bucket
	// as proof regardless of what CreateBucket said.
	if _, headErr := s.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: &s.bucket}); headErr == nil {
		return nil
	}
	return fmt.Errorf("preparing bucket %q: %w", s.bucket, err)
}

func (s *Seaweed) Put(ctx context.Context, key string, body io.Reader, contentType string) error {
	// The manager uploads in parts from a stream, so a 500MB source is never
	// held in memory in one piece.
	_, err := s.uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:      &s.bucket,
		Key:         &key,
		Body:        body,
		ContentType: &contentType,
	})
	if err != nil {
		return fmt.Errorf("put %q: %w", key, err)
	}
	return nil
}

func (s *Seaweed) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: &s.bucket,
		Key:    &key,
	})
	if err != nil {
		return nil, wrap(key, err)
	}
	return out.Body, nil
}

func (s *Seaweed) Size(ctx context.Context, key string) (int64, error) {
	out, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: &s.bucket,
		Key:    &key,
	})
	if err != nil {
		return 0, wrap(key, err)
	}
	if out.ContentLength == nil {
		return 0, nil
	}
	return *out.ContentLength, nil
}

// Delete treats a missing object as success — the workflow calls it on both
// the finished and the cancelled path, and a retry must not fail because the
// first attempt already did the work.
func (s *Seaweed) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: &s.bucket,
		Key:    &key,
	})
	if err != nil && !errors.Is(wrap(key, err), ErrNotFound) {
		return fmt.Errorf("delete %q: %w", key, err)
	}
	return nil
}

func wrap(key string, err error) error {
	var noKey *types.NoSuchKey
	var notFound *types.NotFound
	if errors.As(err, &noKey) || errors.As(err, &notFound) {
		return fmt.Errorf("%q: %w", key, ErrNotFound)
	}
	return err
}
