/**
 * 배송지 (PLAN T-P1C-10, PRD SH-23, API-MAP `/shop/addresses`). 회원 전용, 목록은 기본 배송지 우선.
 * 생성은 `ad_zip`(5자리)을 보내면 서버가 zip1/zip2 로 나눈다. 422 는 `errors{field}`. 기본 배송지 지정은
 * `PATCH /{ad_id} {ad_default:1}`(해제 전용 API 는 없다). 키 루트 `['addresses']` — 계정 스코프.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, request } from '../../shared/api/client';
import { numberValue, stringValue } from '../../shared/api/schemaPrimitives';

export const addressSchema = z.looseObject({
  ad_id: numberValue,
  ad_subject: stringValue.default(''),
  ad_default: numberValue.default(0),
  ad_name: stringValue,
  ad_tel: stringValue.default(''),
  ad_hp: stringValue,
  ad_zip1: stringValue.default(''),
  ad_zip2: stringValue.default(''),
  ad_addr1: stringValue,
  ad_addr2: stringValue.default(''),
  ad_addr3: stringValue.default(''),
  ad_jibeon: stringValue.default(''),
});
export type Address = z.infer<typeof addressSchema>;

/** 폼 → 서버. 서버 길이 제한: 별칭 20, 이름 50, 전화 30, 주소 255. */
export interface AddressInput {
  ad_subject: string;
  ad_name: string;
  ad_hp: string;
  ad_tel: string;
  ad_zip: string;
  ad_addr1: string;
  ad_addr2: string;
  ad_addr3: string;
  ad_jibeon: string;
  ad_default: boolean;
}

function requireAdId(adId: number): number {
  if (!Number.isInteger(adId) || adId <= 0) throw new ApiError('Invalid address id', 0);
  return adId;
}

function toBody(input: AddressInput) {
  return { ...input, ad_zip: input.ad_zip.replace(/\D/g, ''), ad_default: input.ad_default ? 1 : 0 };
}

export function listAddresses(): Promise<Address[]> {
  return request('/shop/addresses', { schema: z.array(addressSchema) });
}

export function createAddress(input: AddressInput): Promise<Address> {
  return request('/shop/addresses', { method: 'POST', body: toBody(input), schema: addressSchema });
}

export async function updateAddress(adId: number, input: AddressInput): Promise<Address> {
  return request(`/shop/addresses/${requireAdId(adId)}`, {
    method: 'PATCH',
    body: toBody(input),
    schema: addressSchema,
  });
}

export async function setDefaultAddress(adId: number): Promise<Address> {
  return request(`/shop/addresses/${requireAdId(adId)}`, {
    method: 'PATCH',
    body: { ad_default: 1 },
    schema: addressSchema,
  });
}

export async function deleteAddress(adId: number): Promise<unknown> {
  return request(`/shop/addresses/${requireAdId(adId)}`, { method: 'DELETE' });
}

export const addressKeys = { root: ['addresses'] as const, list: ['addresses', 'list'] as const };

export function useAddressesQuery(enabled = true) {
  return useQuery({ queryKey: addressKeys.list, queryFn: listAddresses, enabled });
}

function useAddressMutation<V, R>(run: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: run, onSettled: () => qc.invalidateQueries({ queryKey: addressKeys.root }) });
}

export function useSaveAddress() {
  return useAddressMutation(({ adId, input }: { adId: number | null; input: AddressInput }) =>
    adId === null ? createAddress(input) : updateAddress(adId, input),
  );
}

export function useSetDefaultAddress() {
  return useAddressMutation(setDefaultAddress);
}

export function useDeleteAddress() {
  return useAddressMutation(deleteAddress);
}
