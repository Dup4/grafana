package datasource

import (
	"context"
	"fmt"
	"strconv"

	"github.com/google/wire"
	"github.com/grafana/grafana/internal/components/store"
	"github.com/grafana/grafana/pkg/components/simplejson"
	"github.com/grafana/grafana/pkg/models"
	"github.com/grafana/grafana/pkg/services/sqlstore"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

var SchemaStoreProvidersSet wire.ProviderSet = wire.NewSet(
	ProvideDataSourceSchemaStore,
	wire.Bind(new(store.Store), new(*storeDS)),
)

func ProvideDataSourceSchemaStore(ss *sqlstore.SQLStore) *storeDS {
	return &storeDS{
		ss: ss,
	}
	// return an instantiate instance of storeDS with injected state it may need
}

type storeDS struct {
	ss *sqlstore.SQLStore
}

func (s storeDS) Get(ctx context.Context, uid string) (runtime.Object, error) {
	cmd := &models.GetDataSourceQuery{
		OrgId: 1, // Hardcode for now
		Uid:   uid,
	}

	if err := s.ss.GetDataSource(ctx, cmd); err != nil {
		return nil, err
	}

	return s.oldToNew(cmd.Result), nil
}

func (s storeDS) Insert(ctx context.Context, o runtime.Object) error {
	ds, ok := o.(*Datasource)
	if !ok {
		return fmt.Errorf("unexpected type: %T", o)
	}
	cmd := &models.AddDataSourceCommand{
		Name:              ds.Spec.Name,
		Type:              ds.Spec.Type,
		Access:            models.DsAccess(ds.Spec.Access),
		Url:               ds.Spec.Url,
		Password:          ds.Spec.Password,
		Database:          ds.Spec.Database,
		User:              ds.Spec.User,
		BasicAuth:         ds.Spec.BasicAuth,
		BasicAuthUser:     ds.Spec.BasicAuthUser,
		BasicAuthPassword: ds.Spec.BasicAuthPassword,
		WithCredentials:   ds.Spec.WithCredentials,
		IsDefault:         ds.Spec.IsDefault,
		JsonData:          simplejson.NewFromAny(ds.Spec.JsonData),
		// SecureJsonData: TODO,
		Uid:   ds.ObjectMeta.Name,
		OrgId: 1, // hardcode for now, TODO
	}
	return s.ss.AddDataSource(ctx, cmd)
}

func (s storeDS) Update(ctx context.Context, o runtime.Object) error {
	ds, ok := o.(*Datasource)
	if !ok {
		return fmt.Errorf("unexpected type: %T", o)
	}
	rv, err := strconv.Atoi(ds.ResourceVersion)
	if err != nil {
		return err
	}
	cmd := &models.UpdateDataSourceCommand{
		Name:              ds.Spec.Name,
		Type:              ds.Spec.Type,
		Access:            models.DsAccess(ds.Spec.Access),
		Url:               ds.Spec.Url,
		Password:          ds.Spec.Password,
		Database:          ds.Spec.Database,
		User:              ds.Spec.User,
		BasicAuth:         ds.Spec.BasicAuth,
		BasicAuthUser:     ds.Spec.BasicAuthUser,
		BasicAuthPassword: ds.Spec.BasicAuthPassword,
		WithCredentials:   ds.Spec.WithCredentials,
		IsDefault:         ds.Spec.IsDefault,
		JsonData:          simplejson.NewFromAny(ds.Spec.JsonData),
		// SecureJsonData: TODO,
		Uid:     ds.ObjectMeta.Name,
		OrgId:   1, // hardcode for now, TODO
		Version: rv,
		// TODO: sets updated timestamp
	}
	// Note: SQL version returns the modified ds with the version bumped
	// and timestamps set
	return s.ss.UpdateDataSourceByUID(ctx, cmd)
}

func (s storeDS) Delete(ctx context.Context, uid string) error {
	return s.ss.DeleteDataSource(ctx, &models.DeleteDataSourceCommand{
		UID:   uid,
		OrgID: 1, // hardcode for now, TODO
	})
}

// oldToNew doesn't need to be method, but keeps things bundled
func (s storeDS) oldToNew(ds *models.DataSource) *Datasource {
	jdMap := ds.JsonData.MustMap()
	cr := Datasource{
		ObjectMeta: v1.ObjectMeta{
			Name: ds.Uid,
			ResourceVersion: strconv.Itoa(ds.Version),
		},
		Spec: Model{
			Name: ds.Name,
			Type:              ds.Type,
			Access:            string(ds.Access),
			Url:               ds.Url,
			Password:          ds.Password,
			Database:          ds.Database,
			User:              ds.User,
			BasicAuth:         ds.BasicAuth,
			BasicAuthUser:     ds.BasicAuthUser,
			BasicAuthPassword: ds.BasicAuthPassword,
			WithCredentials:   ds.WithCredentials,
			IsDefault:         ds.IsDefault,
			JsonData:          jdMap,
			// SecureJsonData: TODO,
			//Version: ds.Version,
			// Note: Not mapped is created / updated time stamps
		},
	}
	return &cr
}