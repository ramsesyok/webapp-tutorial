package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	middleware "github.com/oapi-codegen/nethttp-middleware"
)

const invalidJSONBody = "リクエストボディを application/json のJSONオブジェクトで送信してください。"

func writeValidationError(_ context.Context, err error, w http.ResponseWriter, _ *http.Request, _ middleware.ErrorHandlerOpts) {
	// The validator reports authentication, path and query errors before body errors.
	if validationErrors, ok := err.(openapi3.MultiError); ok {
		err = validationErrors[0]
	}
	var securityError *openapi3filter.SecurityRequirementsError
	if errors.As(err, &securityError) {
		if !errors.Is(err, errUnauthenticated) {
			databaseError(w, err)
			return
		}
		unauthenticated(w)
		return
	}
	requestError, ok := err.(*openapi3filter.RequestError)
	if !ok || requestError.RequestBody == nil {
		message, _, _ := strings.Cut(err.Error(), "\n")
		badRequest(w, message)
		return
	}

	fields := make(map[string]string)
	collectFieldErrors(requestError.Err, fields)
	if len(fields) == 0 {
		badRequest(w, invalidJSONBody)
		return
	}
	writeJSON(w, http.StatusBadRequest, Error{
		Code:        INVALIDINPUT,
		Message:     "入力内容を確認してください。",
		FieldErrors: &fields,
	})
}

func unauthenticated(w http.ResponseWriter) {
	writeJSON(w, http.StatusUnauthorized, Error{Code: UNAUTHENTICATED, Message: "ログインしてください。"})
}

func collectFieldErrors(err error, fields map[string]string) {
	for err != nil {
		switch validationError := err.(type) {
		case openapi3.MultiError:
			for _, child := range validationError {
				collectFieldErrors(child, fields)
			}
			return
		case *openapi3.SchemaError:
			if path := validationError.JSONPointer(); len(path) == 1 {
				if _, exists := fields[path[0]]; !exists {
					fields[path[0]] = fieldErrorReason(validationError)
				}
				return
			}
		}
		// allOf errors wrap the failures in the individual schemas.
		err = errors.Unwrap(err)
	}
}

func fieldErrorReason(err *openapi3.SchemaError) string {
	switch err.SchemaField {
	case "required", "nullable", "minLength":
		return "必須項目です。"
	case "pattern":
		if path := err.JSONPointer(); len(path) == 1 && path[0] == "loginId" {
			return "半角英数字、ピリオド、アンダースコア、ハイフンのみ使用できます。"
		}
		return "空白以外の文字を入力してください。"
	case "maxLength":
		return fmt.Sprintf("%d文字以内で入力してください。", *err.Schema.MaxLength)
	case "minimum", "maximum":
		return fmt.Sprintf("%g 以上 %g 以下の数値を入力してください。", *err.Schema.Min, *err.Schema.Max)
	case "enum":
		return "一覧にあるカテゴリを選んでください。"
	case "type":
		if err.Schema.Type.Is(openapi3.TypeNumber) || err.Schema.Type.Is(openapi3.TypeInteger) {
			return "数値を入力してください。"
		}
		return "文字列を入力してください。"
	default:
		return err.Reason
	}
}
