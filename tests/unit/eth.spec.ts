import { test, expect } from '@playwright/test';
import { ethToWei, weiToEth, addEth, mulEth, compareEth } from '@/shared/utils/eth';

test.describe('eth.ts - Aritmética ETH', () => {
  test('0.1 + 0.2 = 0.3 (sem erro de ponto flutuante)', () => {
    expect(addEth('0.1', '0.2')).toBe('0.3');
  });

  test('suporta até 18 casas decimais', () => {
    const ethValue = '1.123456789012345678';
    const wei = ethToWei(ethValue);
    expect(weiToEth(wei)).toBe(ethValue);
  });

  test('lança erro com 19 casas decimais', () => {
    expect(() => ethToWei('1.1234567890123456789')).toThrow(RangeError);
  });

  test('lança erro para valor inválido "abc"', () => {
    expect(() => ethToWei('abc')).toThrow(RangeError);
  });

  test('lança erro para string vazia', () => {
    expect(() => ethToWei('')).toThrow(RangeError);
  });

  test('lança erro para valor negativo', () => {
    expect(() => ethToWei('-1')).toThrow(RangeError);
  });

  test('lança erro para valor começando com ponto ".5"', () => {
    expect(() => ethToWei('.5')).toThrow(RangeError);
  });

  test('mulEth("0.15", 3) = "0.45"', () => {
    expect(mulEth('0.15', 3)).toBe('0.45');
  });

  test('weiToEth(0n) = "0"', () => {
    expect(weiToEth(0n)).toBe('0');
  });

  test('lança erro para weiToEth com valor negativo', () => {
    expect(() => weiToEth(-1n)).toThrow(RangeError);
  });

  test('mulEth lança erro para quantidade não inteira', () => {
    expect(() => mulEth('1.5', 2.5)).toThrow(RangeError);
  });

  test('mulEth lança erro para quantidade negativa', () => {
    expect(() => mulEth('1.5', -1)).toThrow(RangeError);
  });

  test('round-trip: ethToWei -> weiToEth preserva valor', () => {
    const values = ['0', '1', '0.5', '123.456789', '999.999999999999999999'];
    values.forEach((val) => {
      const normalized = weiToEth(ethToWei(val));
      expect(normalized).toBe(val);
    });
  });

  test('compareEth funciona corretamente', () => {
    expect(compareEth('1', '2')).toBe(-1);
    expect(compareEth('2', '1')).toBe(1);
    expect(compareEth('1.5', '1.5')).toBe(0);
    expect(compareEth('0.1', '0.2')).toBe(-1);
  });

  test('remove zeros à direita após a vírgula', () => {
    expect(weiToEth(ethToWei('1.100'))).toBe('1.1');
    expect(weiToEth(ethToWei('2.000'))).toBe('2');
  });
});
